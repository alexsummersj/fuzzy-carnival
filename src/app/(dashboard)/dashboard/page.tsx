import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Plus, FileText, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

export default async function DashboardPage() {
  const session = await auth();
  const t = await getTranslations();

  if (!session?.user?.id) {
    return null;
  }

  // Fetch user data with subscription
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      subscription: {
        include: { plan: true },
      },
    },
  });

  // Fetch recent analyses
  const recentAnalyses = await prisma.analysis.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      propertyName: true,
      propertyLocation: true,
      overallRiskScore: true,
      trafficLight: true,
      createdAt: true,
      status: true,
    },
  });

  // Calculate stats
  const totalAnalyses = await prisma.analysis.count({
    where: { userId: session.user.id },
  });

  const analysisStats = await prisma.analysis.groupBy({
    by: ['trafficLight'],
    where: { userId: session.user.id, status: 'COMPLETED' },
    _count: true,
  });

  const greenCount = analysisStats.find((s) => s.trafficLight === 'GREEN')?._count || 0;
  const yellowCount = analysisStats.find((s) => s.trafficLight === 'YELLOW')?._count || 0;
  const redCount = analysisStats.find((s) => s.trafficLight === 'RED')?._count || 0;

  const subscription = user?.subscription;
  const usagePercent = subscription?.plan.monthlyAnalysisLimit === -1
    ? 0
    : ((subscription?.analysesUsedThisMonth || 0) / (subscription?.plan.monthlyAnalysisLimit || 1)) * 100;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('nav.dashboard')}
          </h1>
          <p className="text-gray-600">
            Welcome back, {user?.name || user?.email}
          </p>
        </div>
        <Link href="/analyses/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            {t('analysis.newAnalysis')}
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Analyses</CardDescription>
            <CardTitle className="text-3xl">{totalAnalyses}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-gray-600">
              <FileText className="w-4 h-4 mr-1" />
              All time
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Low Risk</CardDescription>
            <CardTitle className="text-3xl text-green-600">{greenCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-green-600">
              <CheckCircle className="w-4 h-4 mr-1" />
              Recommended
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Medium Risk</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{yellowCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-yellow-600">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Needs attention
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High Risk</CardDescription>
            <CardTitle className="text-3xl text-red-600">{redCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-red-600">
              <TrendingUp className="w-4 h-4 mr-1" />
              Not recommended
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage & Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Your Plan: {subscription?.plan.name || 'Free'}</CardTitle>
          <CardDescription>
            {subscription?.plan.monthlyAnalysisLimit === -1
              ? 'Unlimited analyses'
              : `${subscription?.analysesUsedThisMonth || 0} of ${subscription?.plan.monthlyAnalysisLimit} analyses used this month`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscription?.plan.monthlyAnalysisLimit !== -1 && (
            <div className="space-y-2">
              <Progress
                value={usagePercent}
                className="h-2"
                indicatorClassName={
                  usagePercent >= 90
                    ? 'bg-red-500'
                    : usagePercent >= 70
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }
              />
              {usagePercent >= 90 && (
                <p className="text-sm text-red-600">
                  You're running low on analyses.{' '}
                  <Link href="/pricing" className="underline">
                    Upgrade your plan
                  </Link>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Analyses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('history.recent')}</CardTitle>
            <CardDescription>Your latest property analyses</CardDescription>
          </div>
          <Link href="/analyses">
            <Button variant="outline" size="sm">
              {t('history.viewAll')}
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentAnalyses.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">{t('history.empty')}</p>
              <Link href="/analyses/new">
                <Button>{t('history.startAnalysis')}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {recentAnalyses.map((analysis) => (
                <Link
                  key={analysis.id}
                  href={`/analyses/${analysis.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          analysis.trafficLight === 'GREEN'
                            ? 'bg-green-500'
                            : analysis.trafficLight === 'YELLOW'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                      />
                      <div>
                        <p className="font-medium text-gray-900">
                          {analysis.propertyName || 'Unnamed Property'}
                        </p>
                        <p className="text-sm text-gray-600">
                          {analysis.propertyLocation || 'Unknown Location'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {analysis.overallRiskScore !== null
                          ? `${analysis.overallRiskScore}%`
                          : '-'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(analysis.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
