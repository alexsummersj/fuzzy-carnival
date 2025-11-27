import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft,
  Download,
  Share2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
} from 'lucide-react';

export default async function AnalysisDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const t = await getTranslations();

  if (!session?.user?.id) {
    return null;
  }

  const analysis = await prisma.analysis.findFirst({
    where: {
      id: params.id,
      userId: session.user.id,
    },
    include: {
      documents: true,
    },
  });

  if (!analysis) {
    notFound();
  }

  const propertyData = analysis.propertyData as any;
  const riskScores = analysis.riskScores as any;
  const report = analysis.reportContent as any;

  const getTrafficLightClass = (score: number) => {
    if (score <= 35) return 'bg-green-500';
    if (score <= 65) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTrafficLightBg = (light: string) => {
    switch (light?.toLowerCase()) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatCurrency = (amount: number, currency: string = 'AED') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link
            href="/analyses"
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to analyses
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {analysis.propertyName || 'Property Analysis'}
          </h1>
          <p className="text-gray-600">{analysis.propertyLocation}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            {t('report.downloadPdf')}
          </Button>
          <Button variant="outline">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {/* Overall Score */}
      <Card className={`border-2 ${getTrafficLightBg(analysis.trafficLight || '')}`}>
        <CardContent className="py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div
                className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white ${getTrafficLightClass(
                  analysis.overallRiskScore || 50
                )}`}
              >
                {analysis.overallRiskScore}%
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {t('risk.overallScore')}: {analysis.overallRiskScore}/100
                </h2>
                <p className="text-lg">
                  {analysis.trafficLight === 'GREEN'
                    ? t('risk.trafficLights.green')
                    : analysis.trafficLight === 'YELLOW'
                    ? t('risk.trafficLights.yellow')
                    : t('risk.trafficLights.red')}
                </p>
              </div>
            </div>
            <div className="w-full md:w-64">
              <div className="risk-gauge h-4 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black/20 relative"
                  style={{ width: `${analysis.overallRiskScore}%` }}
                >
                  <div className="absolute right-0 top-0 w-1 h-full bg-white shadow" />
                </div>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span>0 Low</span>
                <span>50</span>
                <span>100 High</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Property Summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t('report.summary')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">{t('property.developer')}</p>
              <p className="font-medium">{propertyData?.developer || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('property.type')}</p>
              <p className="font-medium capitalize">
                {propertyData?.propertyType?.replace(/_/g, ' ') || 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('property.bedrooms')}</p>
              <p className="font-medium">
                {propertyData?.bedrooms !== undefined ? propertyData.bedrooms : 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('property.size')}</p>
              <p className="font-medium">
                {propertyData?.areaSqFt
                  ? `${propertyData.areaSqFt.toLocaleString()} sq ft`
                  : 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('property.price')}</p>
              <p className="font-medium">
                {propertyData?.price
                  ? formatCurrency(propertyData.price, propertyData.currency || 'AED')
                  : 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('property.status')}</p>
              <p className="font-medium capitalize">
                {propertyData?.status?.replace(/_/g, ' ') || 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('property.handoverDate')}</p>
              <p className="font-medium">{propertyData?.handoverDate || 'Not specified'}</p>
            </div>
            {propertyData?.pricePerSqFt && (
              <div>
                <p className="text-sm text-gray-500">{t('property.pricePerSqft')}</p>
                <p className="font-medium">
                  {formatCurrency(propertyData.pricePerSqFt, propertyData.currency || 'AED')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Risk Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>{t('report.riskBreakdown')}</CardTitle>
          <CardDescription>
            Detailed analysis of each risk category
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {riskScores && (
            <>
              {/* Developer Risk */}
              <RiskCategory
                title={t('risk.categories.developer')}
                score={riskScores.developer?.score}
                summary={riskScores.developer?.summary}
                factors={riskScores.developer?.factors}
              />

              {/* Location Risk */}
              <RiskCategory
                title={t('risk.categories.location')}
                score={riskScores.location?.score}
                summary={riskScores.location?.summary}
                factors={riskScores.location?.factors}
              />

              {/* Construction Risk */}
              <RiskCategory
                title={t('risk.categories.construction')}
                score={riskScores.construction?.score}
                summary={riskScores.construction?.summary}
                factors={riskScores.construction?.factors}
              />

              {/* Market Risk */}
              <RiskCategory
                title={t('risk.categories.market')}
                score={riskScores.market?.score}
                summary={riskScores.market?.summary}
                factors={riskScores.market?.factors}
              />

              {/* Regulatory Risk */}
              <RiskCategory
                title={t('risk.categories.regulatory')}
                score={riskScores.regulatory?.score}
                summary={riskScores.regulatory?.summary}
                factors={riskScores.regulatory?.factors}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Recommendation */}
      {report?.recommendation && (
        <Card>
          <CardHeader>
            <CardTitle>{t('report.recommendation')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`p-4 rounded-lg border-2 ${getTrafficLightBg(
                report.recommendation.trafficLight
              )}`}
            >
              <h3 className="text-xl font-semibold mb-2">
                {report.recommendation.headline}
              </h3>
              <p>{report.recommendation.details}</p>
            </div>

            {report.recommendation.considerations && (
              <div>
                <h4 className="font-semibold mb-2">
                  {t('report.considerations')}:
                </h4>
                <ul className="space-y-2">
                  {report.recommendation.considerations.map(
                    (item: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Narrative Report */}
      {analysis.reportNarrative && (
        <Card>
          <CardHeader>
            <CardTitle>AI Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none">
              <div dangerouslySetInnerHTML={{ __html: analysis.reportNarrative.replace(/\n/g, '<br/>') }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="text-center text-sm text-gray-500">
        {t('report.generatedOn', {
          date: new Date(analysis.createdAt).toLocaleDateString(),
        })}
      </div>
    </div>
  );
}

function RiskCategory({
  title,
  score,
  summary,
  factors,
}: {
  title: string;
  score?: number;
  summary?: string;
  factors?: Array<{ name: string; impact: string; description: string }>;
}) {
  if (score === undefined) return null;

  const getScoreColor = (s: number) => {
    if (s <= 35) return 'bg-green-500';
    if (s <= 65) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'positive':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'negative':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-lg">{title}</h3>
        <div className="flex items-center gap-2">
          <Progress
            value={score}
            className="w-24 h-2"
            indicatorClassName={getScoreColor(score)}
          />
          <span className="font-medium w-12 text-right">{score}%</span>
        </div>
      </div>
      {summary && <p className="text-gray-600 mb-3">{summary}</p>}
      {factors && factors.length > 0 && (
        <div className="space-y-2">
          {factors.map((factor, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-sm text-gray-600"
            >
              {getImpactIcon(factor.impact)}
              <span>{factor.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
