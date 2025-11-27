'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, FileText, Filter } from 'lucide-react';

interface Analysis {
  id: string;
  propertyName: string;
  propertyLocation: string;
  overallRiskScore: number;
  trafficLight: string;
  createdAt: string;
  status: string;
}

export default function AnalysesPage() {
  const t = useTranslations();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchAnalyses();
  }, [page]);

  const fetchAnalyses = async () => {
    try {
      const res = await fetch(`/api/analyses?page=${page}&pageSize=10`);
      const data = await res.json();
      if (data.success) {
        if (page === 1) {
          setAnalyses(data.data.items);
        } else {
          setAnalyses((prev) => [...prev, ...data.data.items]);
        }
        setHasMore(data.data.hasMore);
      }
    } catch (error) {
      console.error('Failed to fetch analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAnalyses = analyses.filter((a) => {
    const matchesFilter =
      filter === 'all' || a.trafficLight?.toLowerCase() === filter;
    const matchesSearch =
      !search ||
      a.propertyName?.toLowerCase().includes(search.toLowerCase()) ||
      a.propertyLocation?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getTrafficLightClass = (light: string) => {
    switch (light?.toLowerCase()) {
      case 'green':
        return 'bg-green-500';
      case 'yellow':
        return 'bg-yellow-500';
      case 'red':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('history.title')}
          </h1>
          <p className="text-gray-600">
            View and manage all your property analyses
          </p>
        </div>
        <Link href="/analyses/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            {t('analysis.newAnalysis')}
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by property name or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                {t('history.filters.all')}
              </Button>
              <Button
                variant={filter === 'green' ? 'success' : 'outline'}
                size="sm"
                onClick={() => setFilter('green')}
              >
                {t('history.filters.green')}
              </Button>
              <Button
                variant={filter === 'yellow' ? 'warning' : 'outline'}
                size="sm"
                onClick={() => setFilter('yellow')}
              >
                {t('history.filters.yellow')}
              </Button>
              <Button
                variant={filter === 'red' ? 'danger' : 'outline'}
                size="sm"
                onClick={() => setFilter('red')}
              >
                {t('history.filters.red')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analyses List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="spinner h-8 w-8" />
        </div>
      ) : filteredAnalyses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              {search || filter !== 'all'
                ? 'No analyses match your filters'
                : t('history.emptyDesc')}
            </p>
            {!search && filter === 'all' && (
              <Link href="/analyses/new">
                <Button>{t('history.startAnalysis')}</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAnalyses.map((analysis) => (
            <Link
              key={analysis.id}
              href={`/analyses/${analysis.id}`}
              className="block"
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-4 h-4 rounded-full ${getTrafficLightClass(
                          analysis.trafficLight
                        )}`}
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
                      <p className="font-semibold text-lg">
                        {analysis.overallRiskScore !== null
                          ? `${analysis.overallRiskScore}%`
                          : '-'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(analysis.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {hasMore && (
            <div className="text-center pt-4">
              <Button
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
              >
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
