# RiskLens - Real Estate Investment Risk Analysis Platform

A production-ready web application for global real-estate investment risk analysis. Upload property documents or paste broker details to get instant AI-powered risk scores and comprehensive reports.

## Features

- **PDF & Text Parsing**: Upload PDF brochures or paste text from brokers/WhatsApp to automatically extract property details
- **Comprehensive Risk Scoring**: Multi-factor risk analysis covering developer, location, construction, market, and regulatory risks
- **Traffic Light System**: Easy-to-understand green/yellow/red rating for investment decisions
- **AI-Powered Reports**: Generate detailed narrative reports in 15 languages
- **Multi-Language Support**: Full UI and report generation in English, Russian, Arabic, Chinese, French, German, Spanish, Italian, Portuguese, Hindi, Japanese, Korean, Turkish, Dutch, and Polish
- **SaaS-Ready**: User authentication, subscription plans, and usage tracking

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes with clean service architecture
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js v5 (Auth.js)
- **Internationalization**: next-intl
- **PDF Parsing**: pdf-parse
- **UI Components**: Radix UI primitives, shadcn/ui patterns

## Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/            # Authentication pages (login, register)
│   │   ├── (dashboard)/       # Protected dashboard pages
│   │   ├── api/               # API routes
│   │   └── page.tsx           # Landing page
│   ├── components/
│   │   ├── layout/            # Navigation, language selector
│   │   ├── providers/         # Context providers
│   │   └── ui/                # Reusable UI components
│   ├── config/
│   │   └── risk-engine.ts     # Risk scoring configuration
│   ├── i18n/
│   │   ├── config.ts          # i18n configuration
│   │   ├── request.ts         # next-intl request config
│   │   └── messages/          # Translation files (15 languages)
│   ├── lib/
│   │   ├── auth.ts            # NextAuth configuration
│   │   ├── db.ts              # Prisma client
│   │   └── utils.ts           # Utility functions
│   ├── services/
│   │   ├── analysis.service.ts    # Main analysis orchestration
│   │   ├── llm.service.ts         # LLM integration (OpenAI/Anthropic/Mock)
│   │   ├── pdf-parser.service.ts  # PDF text extraction
│   │   ├── risk-engine.service.ts # Risk calculation engine
│   │   ├── storage.service.ts     # File storage abstraction
│   │   └── text-parser.service.ts # Text parsing/normalization
│   └── types/
│       └── index.ts           # TypeScript type definitions
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Database seed data
├── __tests__/
│   └── services/              # Unit tests for services
└── uploads/                   # File storage (gitignored)
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd realestate-risk-analyzer
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/realestate_risk?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# LLM (optional - defaults to mock)
LLM_PROVIDER="mock"  # or "openai" / "anthropic"
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

# File Storage
FILE_STORAGE_PROVIDER="local"
FILE_STORAGE_PATH="./uploads"
```

4. Set up the database:
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:push

# Seed the database
npm run db:seed
```

5. Start the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Architecture

### Risk Scoring Engine

The risk engine calculates scores across five categories:

1. **Developer Risk (25%)**: Based on developer reputation, track record, and delay history
2. **Location Risk (25%)**: Considers demand, infrastructure, vacancy rates, and price trends
3. **Construction Risk (20%)**: Evaluates property status, handover timeline, and construction progress
4. **Market Risk (15%)**: Analyzes property type liquidity, pricing, and market conditions
5. **Regulatory Risk (15%)**: Assesses country-level regulatory, legal, and currency risks

Each category produces a score from 0-100 (higher = more risk), which are weighted and combined into an overall score with a traffic light indicator:
- **Green (0-35)**: Low risk, recommended for most investors
- **Yellow (36-65)**: Medium risk, requires additional due diligence
- **Red (66-100)**: High risk, suitable only for risk-tolerant investors

### Data Flow

1. User uploads PDF or pastes text
2. **Parse Service** extracts structured property data
3. User reviews and edits extracted data
4. **Risk Engine** calculates scores using:
   - Internal configuration rules
   - Database lookups for developer/location profiles
5. **LLM Service** generates narrative report
6. Results stored and displayed to user

### LLM Integration

The platform supports multiple LLM providers for report generation:

- **Mock**: Template-based reports (default, no API key needed)
- **OpenAI**: GPT-4 powered reports
- **Anthropic**: Claude powered reports

Configure via `LLM_PROVIDER` environment variable.

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `GET/POST /api/auth/[...nextauth]` - NextAuth handlers

### Analyses
- `GET /api/analyses` - List user's analyses (paginated)
- `POST /api/analyses` - Create new analysis
- `GET /api/analyses/[id]` - Get single analysis
- `PATCH /api/analyses/[id]` - Update property data and recalculate
- `DELETE /api/analyses/[id]` - Delete analysis
- `POST /api/analyses/parse` - Parse input without creating analysis (preview)

### User
- `GET /api/user` - Get current user profile
- `PATCH /api/user` - Update profile

### Plans
- `GET /api/plans` - List subscription plans

## Subscription Plans

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Analyses/month | 3 | 50 | Unlimited |
| PDF uploads | 2 | 5 | 10 |
| Basic scoring | ✓ | ✓ | ✓ |
| Advanced scoring | - | ✓ | ✓ |
| AI reports | - | ✓ | ✓ |
| PDF export | - | ✓ | ✓ |
| API access | - | - | ✓ |
| Price | $0 | $29/mo | $99/mo |

## Extending the Platform

### Adding a New Country

1. Add country risk profile to database seed (`prisma/seed.ts`)
2. Add location profiles for major cities/areas
3. Add country adjustment in `src/config/risk-engine.ts`

### Adding a New Language

1. Create translation file in `src/i18n/messages/{locale}.json`
2. Add locale to `src/i18n/config.ts`
3. Update report templates in `src/services/llm.service.ts`

### Custom Risk Factors

Edit `src/config/risk-engine.ts` to adjust:
- Category weights
- Risk thresholds
- Developer/location/construction rules
- Property type adjustments

### Implementing Stripe Payments

The data model is ready for Stripe integration:
1. Add Stripe SDK
2. Implement webhook handlers
3. Update subscription service to sync with Stripe
4. Add payment UI components

## License

Proprietary - All rights reserved

## Support

For support, contact: support@risklens.io
