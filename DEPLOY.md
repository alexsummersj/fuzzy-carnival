# Руководство по деплою на DigitalOcean

Пошаговая инструкция по развертыванию Real Estate Risk Analysis Platform на DigitalOcean.

## Требования

- DigitalOcean Droplet (рекомендуется: 8GB RAM, 4 vCPU)
- DigitalOcean Managed PostgreSQL Database
- Доменное имя с настроенным DNS
- SSH доступ к серверу

## 1. Настройка Managed Database

### В панели DigitalOcean:

1. Перейдите в **Databases** → **Create Database Cluster**
2. Выберите **PostgreSQL** (версия 15 или выше)
3. Выберите тот же регион, что и ваш Droplet
4. Выберите план (минимум $15/мес для продакшена)
5. После создания, перейдите в настройки базы данных
6. Создайте новую базу данных с именем `realestate_risk`
7. Скопируйте **Connection String** (понадобится позже)

### Настройка доступа:

1. В разделе **Trusted Sources** добавьте IP вашего Droplet
2. Или выберите вашу VPC сеть

## 2. Настройка Droplet

### Подключение по SSH:

```bash
ssh root@YOUR_DROPLET_IP
```

### Установка Docker:

```bash
# Обновление системы
apt update && apt upgrade -y

# Установка необходимых пакетов
apt install -y apt-transport-https ca-certificates curl software-properties-common

# Добавление Docker репозитория
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установка Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Проверка установки
docker --version
docker compose version
```

### Установка Git:

```bash
apt install -y git
```

## 3. Клонирование проекта

```bash
# Создание директории для приложения
mkdir -p /opt/apps
cd /opt/apps

# Клонирование репозитория
git clone https://github.com/YOUR_USERNAME/fuzzy-carnival.git realestate-risk
cd realestate-risk
```

## 4. Настройка окружения

### Создание .env файла:

```bash
cp .env.example .env
nano .env
```

### Заполните переменные:

```env
# Database (используйте Connection String из DigitalOcean)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/realestate_risk?sslmode=require"

# NextAuth
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="your-super-secret-key-min-32-chars"

# Google OAuth (опционально)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# LLM Provider (выберите один)
LLM_PROVIDER="openai"  # или "anthropic" или "mock"
OPENAI_API_KEY="sk-your-openai-key"
# ANTHROPIC_API_KEY="your-anthropic-key"

# Storage
STORAGE_PROVIDER="local"
UPLOAD_DIR="/app/uploads"

# Application
NODE_ENV="production"
```

### Генерация NEXTAUTH_SECRET:

```bash
openssl rand -base64 32
```

## 5. Настройка DNS

В панели управления вашего домена:

1. Создайте A-запись: `@` → IP вашего Droplet
2. Создайте A-запись: `www` → IP вашего Droplet

Подождите 5-15 минут для распространения DNS.

## 6. Первичный запуск

### Создание директорий:

```bash
mkdir -p certbot/conf certbot/www uploads
chmod 755 uploads
```

### Настройка начального Nginx конфига:

```bash
# Копируем начальный конфиг (без SSL)
cp nginx/conf.d/initial.conf.example nginx/conf.d/default.conf

# Заменяем placeholder на ваш домен
sed -i 's/YOUR_DOMAIN.com/your-domain.com/g' nginx/conf.d/default.conf
```

### Сборка и запуск:

```bash
# Сборка приложения
docker compose -f docker-compose.prod.yml build

# Запуск в фоновом режиме
docker compose -f docker-compose.prod.yml up -d
```

### Проверка статуса:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

## 7. Получение SSL сертификата

### Используйте автоматический скрипт:

```bash
chmod +x scripts/init-ssl.sh
DOMAIN=your-domain.com EMAIL=your@email.com sudo ./scripts/init-ssl.sh
```

### Или вручную:

```bash
# Получение сертификата
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your@email.com \
  --agree-tos \
  --no-eff-email \
  -d your-domain.com \
  -d www.your-domain.com

# После получения сертификата обновите nginx конфиг
# (используйте полный конфиг с SSL из nginx/conf.d/default.conf)

# Перезапуск nginx
docker compose -f docker-compose.prod.yml restart nginx
```

## 8. Инициализация базы данных

```bash
# Применение миграций
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy

# Заполнение начальными данными (планы подписки и т.д.)
docker compose -f docker-compose.prod.yml exec app npx prisma db seed
```

## 9. Проверка работоспособности

```bash
# Проверка health endpoint
curl https://your-domain.com/api/health

# Должен вернуть:
# {"status":"ok","timestamp":"...","uptime":...,"checks":{"database":"ok"}}
```

## 10. Настройка автозапуска

### Создание systemd сервиса:

```bash
cat > /etc/systemd/system/realestate-risk.service << EOF
[Unit]
Description=Real Estate Risk Analysis Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/apps/realestate-risk
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Активация сервиса
systemctl enable realestate-risk
systemctl start realestate-risk
```

## 11. Настройка автообновления SSL

```bash
# Добавление в crontab
(crontab -l 2>/dev/null; echo "0 0 * * * cd /opt/apps/realestate-risk && docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker compose -f docker-compose.prod.yml restart nginx") | crontab -
```

## Обновление приложения

```bash
cd /opt/apps/realestate-risk

# Получение обновлений
git pull origin main

# Пересборка и перезапуск
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Применение миграций (если есть)
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

## Мониторинг и логи

```bash
# Просмотр логов приложения
docker compose -f docker-compose.prod.yml logs -f app

# Просмотр логов nginx
docker compose -f docker-compose.prod.yml logs -f nginx

# Статус контейнеров
docker compose -f docker-compose.prod.yml ps

# Использование ресурсов
docker stats
```

## Резервное копирование

### База данных:
DigitalOcean Managed Database автоматически создает бэкапы. Вы можете настроить частоту в панели управления.

### Загруженные файлы:

```bash
# Создание бэкапа uploads
tar -czf /backup/uploads-$(date +%Y%m%d).tar.gz /opt/apps/realestate-risk/uploads

# Настройка автоматического бэкапа
(crontab -l 2>/dev/null; echo "0 2 * * * tar -czf /backup/uploads-\$(date +\%Y\%m\%d).tar.gz /opt/apps/realestate-risk/uploads") | crontab -
```

## Решение проблем

### Приложение не запускается:

```bash
# Проверка логов
docker compose -f docker-compose.prod.yml logs app

# Проверка подключения к БД
docker compose -f docker-compose.prod.yml exec app npx prisma db pull
```

### Ошибка 502 Bad Gateway:

```bash
# Проверка что app контейнер работает
docker compose -f docker-compose.prod.yml ps

# Перезапуск
docker compose -f docker-compose.prod.yml restart
```

### SSL сертификат не обновляется:

```bash
# Ручное обновление
docker compose -f docker-compose.prod.yml run --rm certbot renew --force-renewal
docker compose -f docker-compose.prod.yml restart nginx
```

## Безопасность

### Настройка файрвола:

```bash
# Установка ufw
apt install -y ufw

# Базовые правила
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https

# Активация
ufw enable
```

### Отключение root SSH (рекомендуется):

```bash
# Создайте обычного пользователя
adduser deploy
usermod -aG docker deploy

# Настройте SSH ключи для нового пользователя
# Затем отключите root login в /etc/ssh/sshd_config
```

## Контакты и поддержка

При возникновении проблем создайте issue в репозитории проекта.
