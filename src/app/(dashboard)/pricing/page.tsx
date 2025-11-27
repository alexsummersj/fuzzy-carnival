import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Check } from 'lucide-react';

export default async function PricingPage() {
  const session = await auth();
  const t = await getTranslations('pricing');

  // Fetch plans
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceMonthly: 'asc' },
  });

  // Get user's current subscription
  let currentPlanType = null;
  if (session?.user?.id) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
      include: { plan: true },
    });
    currentPlanType = subscription?.plan.type;
  }

  const formatPrice = (price: number) => {
    if (price === 0) return 'Free';
    return `$${price}`;
  };

  const getPlanDescription = (type: string) => {
    switch (type) {
      case 'FREE':
        return t('free.desc');
      case 'PRO':
        return t('pro.desc');
      case 'ENTERPRISE':
        return t('enterprise.desc');
      default:
        return '';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </div>

      {/* Pricing Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-4 bg-gray-100 p-1 rounded-lg">
          <span className="px-4 py-2 bg-white rounded-md shadow-sm font-medium">
            {t('monthly')}
          </span>
          <span className="px-4 py-2 text-gray-600">
            {t('yearly')} <span className="text-green-600 text-sm">({t('yearlyDiscount', { percent: 17 })})</span>
          </span>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlanType === plan.type;
          const features = plan.features as string[];

          return (
            <Card
              key={plan.id}
              className={`relative ${
                plan.type === 'PRO'
                  ? 'border-primary border-2 shadow-lg'
                  : ''
              }`}
            >
              {plan.type === 'PRO' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{getPlanDescription(plan.type)}</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-4xl font-bold">
                    {formatPrice(plan.priceMonthly)}
                  </span>
                  {plan.priceMonthly > 0 && (
                    <span className="text-gray-600">{t('perMonth')}</span>
                  )}
                </div>

                <ul className="space-y-3 text-left">
                  {features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.type === 'PRO' ? 'default' : 'outline'}
                  disabled={isCurrentPlan}
                >
                  {isCurrentPlan
                    ? t('currentPlan')
                    : plan.priceMonthly === 0
                    ? 'Get Started'
                    : t('selectPlan')}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* FAQ or Additional Info */}
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-xl font-semibold mb-4">Need a custom plan?</h2>
        <p className="text-gray-600 mb-4">
          For enterprise needs, custom integrations, or volume discounts,
          contact our sales team.
        </p>
        <Button variant="outline">Contact Sales</Button>
      </div>
    </div>
  );
}
