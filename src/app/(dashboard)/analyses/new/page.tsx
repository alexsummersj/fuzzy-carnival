'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import {
  Upload,
  FileText,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { locales, localeNames } from '@/i18n/config';

type Step = 'input' | 'review' | 'results';

export default function NewAnalysisPage() {
  const t = useTranslations();
  const router = useRouter();
  const [step, setStep] = useState<Step>('input');
  const [inputType, setInputType] = useState<'pdf' | 'text'>('pdf');
  const [files, setFiles] = useState<File[]>([]);
  const [textInput, setTextInput] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [parseLoading, setParsing] = useState(false);
  const [summary, setSummary] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [rawText, setRawText] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(
      (f) => f.type === 'application/pdf'
    ).slice(0, 5);
    setFiles((prev) => [...prev, ...pdfFiles].slice(0, 5));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 5,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleParse = async () => {
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('language', language);

      if (files.length > 0) {
        files.forEach((file) => formData.append('files', file));
      }

      if (textInput) {
        formData.append('textInput', textInput);
      }

      const res = await fetch('/api/analyses/parse', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setSummary(data.data.summary);
        setRawText(data.data.rawText);
        setStep('review');
      } else {
        toast({
          title: 'Error',
          description: data.error?.message || 'Failed to analyze document',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to parse input',
        variant: 'destructive',
      });
    } finally {
      setParsing(false);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('inputType', inputType);
      formData.append('language', language);

      // Send raw text + additional info for AI to process
      const fullText = rawText + (additionalInfo ? `\n\n--- Additional Information ---\n${additionalInfo}` : '');
      formData.append('textInput', fullText);

      if (files.length > 0) {
        files.forEach((file) => formData.append('files', file));
      }

      const res = await fetch('/api/analyses', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setAnalysisResult(data.data);
        setStep('results');
      } else {
        toast({
          title: 'Analysis Failed',
          description: data.error?.message || 'Failed to complete analysis',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create analysis',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const canProceed = inputType === 'pdf' ? files.length > 0 : textInput.trim().length > 50;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('analysis.newAnalysis')}
        </h1>
        <p className="text-gray-600">
          Upload documents or paste property details to analyze investment risk
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 ${step === 'input' ? 'text-primary' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'input' ? 'bg-primary text-white' : 'bg-gray-200'}`}>
            1
          </div>
          <span className="font-medium">Input</span>
        </div>
        <div className="flex-1 h-1 bg-gray-200">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: step === 'input' ? '0%' : step === 'review' ? '50%' : '100%' }}
          />
        </div>
        <div className={`flex items-center gap-2 ${step === 'review' ? 'text-primary' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'review' ? 'bg-primary text-white' : step === 'results' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>
            2
          </div>
          <span className="font-medium">Review</span>
        </div>
        <div className="flex-1 h-1 bg-gray-200">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: step === 'results' ? '100%' : '0%' }}
          />
        </div>
        <div className={`flex items-center gap-2 ${step === 'results' ? 'text-primary' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'results' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>
            3
          </div>
          <span className="font-medium">Results</span>
        </div>
      </div>

      {/* Step 1: Input */}
      {step === 'input' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('analysis.inputType')}</CardTitle>
            <CardDescription>
              Choose how you want to provide property information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Input Type Selection */}
            <div className="flex gap-4">
              <Button
                variant={inputType === 'pdf' ? 'default' : 'outline'}
                onClick={() => setInputType('pdf')}
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                {t('analysis.uploadPdf')}
              </Button>
              <Button
                variant={inputType === 'text' ? 'default' : 'outline'}
                onClick={() => setInputType('text')}
                className="flex-1"
              >
                <FileText className="w-4 h-4 mr-2" />
                {t('analysis.pasteText')}
              </Button>
            </div>

            {/* PDF Upload */}
            {inputType === 'pdf' && (
              <div>
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{t('analysis.uploadDesc')}</p>
                  <p className="text-sm text-gray-400 mt-2">
                    {t('analysis.uploadLimit', { count: 5 })}
                  </p>
                </div>

                {files.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-500" />
                          <span className="text-sm">{file.name}</span>
                          <span className="text-xs text-gray-400">
                            ({Math.round(file.size / 1024)} KB)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Text Input */}
            {inputType === 'text' && (
              <div>
                <Label>{t('analysis.textTitle')}</Label>
                <textarea
                  className="w-full mt-2 p-4 border rounded-lg min-h-[200px] resize-y"
                  placeholder={t('analysis.textPlaceholder')}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                />
                <p className="text-sm text-gray-500 mt-2">
                  {textInput.length} characters
                </p>
              </div>
            )}

            {/* Language Selection */}
            <div>
              <Label>Report Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {localeNames[loc]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-4">
              <Button
                onClick={handleParse}
                disabled={!canProceed || parseLoading}
              >
                {parseLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Analyze with AI
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review - Simplified */}
      {step === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Summary
            </CardTitle>
            <CardDescription>
              Review what AI found in your documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* AI Summary */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-lg p-6">
              <p className="text-gray-800 text-lg leading-relaxed">
                {summary}
              </p>
            </div>

            {/* Additional Info */}
            <div>
              <Label className="text-base font-medium">
                Additional Information (optional)
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Add any details AI might have missed - price, developer, location, etc.
              </p>
              <textarea
                className="w-full p-4 border rounded-lg min-h-[120px] resize-y"
                placeholder="Example: This is a 2BR apartment by Emaar in Dubai Marina, priced at AED 2.5M, handover Q4 2025..."
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between gap-4 pt-4">
              <Button variant="outline" onClick={() => setStep('input')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleAnalyze} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('analysis.analyzing')}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Generate Risk Report
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Results */}
      {step === 'results' && analysisResult && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div
                  className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold ${
                    analysisResult.riskScores.trafficLight === 'green'
                      ? 'bg-green-100 text-green-700'
                      : analysisResult.riskScores.trafficLight === 'yellow'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {analysisResult.riskScores.overall}%
                </div>
              </div>
              <CardTitle>
                {t('risk.overallScore')}: {analysisResult.riskScores.overall}/100
              </CardTitle>
              <CardDescription className="text-lg">
                {analysisResult.riskScores.trafficLight === 'green'
                  ? t('risk.trafficLights.green')
                  : analysisResult.riskScores.trafficLight === 'yellow'
                  ? t('risk.trafficLights.yellow')
                  : t('risk.trafficLights.red')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center gap-4">
                <Button
                  onClick={() => router.push(`/analyses/${analysisResult.id}`)}
                >
                  {t('analysis.viewResults')}
                </Button>
                <Button variant="outline" onClick={() => {
                  setStep('input');
                  setFiles([]);
                  setTextInput('');
                  setSummary('');
                  setAdditionalInfo('');
                  setRawText('');
                  setAnalysisResult(null);
                }}>
                  {t('analysis.startOver')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
