'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/toaster';
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  preferredLanguage: string;
  subscription: {
    planType: string;
    planName: string;
    status: string;
    analysisLimit: number;
    analysesUsed: number;
    currentPeriodEnd: string;
  } | null;
}

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const t = useTranslations('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    preferredLanguage: 'en',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/user');
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        setFormData({
          name: data.data.name || '',
          preferredLanguage: data.data.preferredLanguage || 'en',
        });
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.success) {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                name: formData.name,
                preferredLanguage: formData.preferredLanguage,
              }
            : null
        );

        // Update session
        await updateSession({
          name: formData.name,
          preferredLanguage: formData.preferredLanguage,
        });

        toast({
          title: t('profileUpdated'),
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner h-8 w-8" />
      </div>
    );
  }

  const subscription = profile?.subscription;
  const usagePercent =
    subscription?.analysisLimit === -1
      ? 0
      : ((subscription?.analysesUsed || 0) /
          (subscription?.analysisLimit || 1)) *
        100;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t('personalInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={profile?.email || ''} disabled className="mt-1" />
          </div>

          <div>
            <Label>Name</Label>
            <Input
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>{t('preferences')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t('preferredLanguage')}</Label>
            <Select
              value={formData.preferredLanguage}
              onValueChange={(v) =>
                setFormData({ ...formData, preferredLanguage: v })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {localeFlags[loc]} {localeNames[loc]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSave} loading={saving}>
            {t('updateProfile')}
          </Button>
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card>
        <CardHeader>
          <CardTitle>{t('subscription')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">{t('currentPlan')}</p>
              <p className="font-semibold text-lg">
                {subscription?.planName || 'Free'}
              </p>
            </div>
            <Button variant="outline">{t('managePlan')}</Button>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">{t('usageThisMonth')}</span>
              <span>
                {subscription?.analysisLimit === -1
                  ? t('analysesUnlimited')
                  : t('analysesUsed', {
                      used: subscription?.analysesUsed || 0,
                      limit: subscription?.analysisLimit || 0,
                    })}
              </span>
            </div>
            {subscription?.analysisLimit !== -1 && (
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
            )}
          </div>

          {subscription?.currentPeriodEnd && (
            <p className="text-sm text-gray-600">
              {t('renewsOn', {
                date: new Date(subscription.currentPeriodEnd).toLocaleDateString(),
              })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
