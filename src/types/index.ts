/**
 * Core type definitions for the Real Estate Risk Analysis Platform
 */

// ============================================
// Property Data Types
// ============================================

export interface PropertyData {
  // Basic Information
  name?: string;
  developer?: string;
  developerNormalized?: string;

  // Location
  country?: string;
  countryCode?: string;
  city?: string;
  area?: string;
  neighborhood?: string;
  fullAddress?: string;

  // Property Details
  propertyType?: PropertyType;
  bedrooms?: number;
  bathrooms?: number;
  totalRooms?: number;
  areaSqM?: number;
  areaSqFt?: number;
  floor?: number;
  totalFloors?: number;
  view?: string;

  // Pricing
  price?: number;
  currency?: string;
  pricePerSqM?: number;
  pricePerSqFt?: number;

  // Payment Plan
  paymentPlan?: PaymentPlan;

  // Timeline
  status?: PropertyStatus;
  handoverDate?: string;
  constructionProgress?: number; // percentage

  // Amenities
  amenities?: string[];

  // Additional
  description?: string;
  projectName?: string;
  unitNumber?: string;
  parkingSpaces?: number;

  // Metadata
  sourceType: 'pdf' | 'text' | 'form' | 'mixed';
  confidence?: number; // 0-100, how confident we are in parsed data
  rawText?: string;
}

export type PropertyType =
  | 'apartment'
  | 'villa'
  | 'townhouse'
  | 'penthouse'
  | 'studio'
  | 'duplex'
  | 'loft'
  | 'land'
  | 'commercial'
  | 'office'
  | 'retail'
  | 'warehouse'
  | 'other';

export type PropertyStatus =
  | 'ready'
  | 'off_plan'
  | 'under_construction'
  | 'pre_launch'
  | 'resale';

export interface PaymentPlan {
  downPayment?: number; // percentage
  duringConstruction?: number; // percentage
  onHandover?: number; // percentage
  postHandover?: number; // percentage
  installmentMonths?: number;
  notes?: string;
}

// ============================================
// Risk Scoring Types
// ============================================

export interface RiskScores {
  developer: RiskCategoryScore;
  location: RiskCategoryScore;
  construction: RiskCategoryScore;
  market: RiskCategoryScore;
  regulatory: RiskCategoryScore;
  overall: number;
  trafficLight: TrafficLightColor;
}

export interface RiskCategoryScore {
  score: number; // 0-100, higher = more risk
  weight: number; // contribution to overall score
  factors: RiskFactor[];
  summary: string;
}

export interface RiskFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  score: number; // contribution to category score
  description: string;
}

export type TrafficLightColor = 'green' | 'yellow' | 'red';

// ============================================
// Analysis Types
// ============================================

export interface AnalysisInput {
  inputType: 'pdf' | 'text' | 'mixed';
  textInput?: string;
  files?: File[];
  language: string;
}

export interface AnalysisResult {
  id: string;
  propertyData: PropertyData;
  riskScores: RiskScores;
  report: AnalysisReport;
  createdAt: Date;
}

export interface AnalysisReport {
  language: string;
  summary: ReportSummary;
  riskBreakdown: RiskBreakdownSection[];
  recommendation: ReportRecommendation;
  narrative?: string;
}

export interface ReportSummary {
  propertyName: string;
  location: string;
  developer: string;
  price: string;
  size: string;
  handoverDate: string;
  propertyType: string;
}

export interface RiskBreakdownSection {
  category: string;
  score: number;
  color: TrafficLightColor;
  explanation: string;
  factors: string[];
}

export interface ReportRecommendation {
  trafficLight: TrafficLightColor;
  headline: string;
  details: string;
  considerations: string[];
}

// ============================================
// User & Subscription Types
// ============================================

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  preferredLanguage: string;
  subscription?: SubscriptionInfo;
  analysesThisMonth: number;
}

export interface SubscriptionInfo {
  planType: 'FREE' | 'PRO' | 'ENTERPRISE';
  planName: string;
  status: 'active' | 'cancelled' | 'past_due';
  analysisLimit: number;
  analysesUsed: number;
  currentPeriodEnd: Date;
}

export interface PlanInfo {
  id: string;
  name: string;
  type: 'FREE' | 'PRO' | 'ENTERPRISE';
  monthlyAnalysisLimit: number;
  maxPdfUploads: number;
  maxTextLength: number;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
}

// ============================================
// API Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================
// Configuration Types
// ============================================

export interface RiskEngineConfig {
  weights: CategoryWeights;
  thresholds: RiskThresholds;
  developerRules: DeveloperRiskRules;
  locationRules: LocationRiskRules;
  constructionRules: ConstructionRiskRules;
}

export interface CategoryWeights {
  developer: number;
  location: number;
  construction: number;
  market: number;
  regulatory: number;
}

export interface RiskThresholds {
  greenMax: number;
  yellowMax: number;
}

export interface DeveloperRiskRules {
  unknownDeveloperPenalty: number;
  delayHistoryWeight: number;
  reputationWeight: number;
  projectsCompletedBonus: number;
}

export interface LocationRiskRules {
  demandWeight: number;
  infrastructureWeight: number;
  vacancyWeight: number;
  priceGrowthWeight: number;
}

export interface ConstructionRiskRules {
  offPlanPenalty: number;
  longHandoverPenalty: number;
  progressBonus: number;
}

// ============================================
// LLM Service Types
// ============================================

export interface LLMProvider {
  generateReport(
    propertyData: PropertyData,
    riskScores: RiskScores,
    language: string
  ): Promise<string>;

  extractPropertyData?(
    text: string,
    sourceType: 'pdf' | 'text'
  ): Promise<Partial<PropertyData> | null>;

  generateSummary?(
    text: string,
    language: string
  ): Promise<string>;

  evaluateDeveloper?(
    developerName: string,
    country?: string
  ): Promise<DeveloperEvaluation>;
}

export interface DeveloperEvaluation {
  found: boolean;
  reputationScore: number; // 0-100, higher is better
  riskScore: number; // 0-100, higher is riskier
  projectsCompleted: number;
  description: string;
  concerns: string[];
  positives: string[];
}

export interface ExtractedPropertyData {
  data: Partial<PropertyData>;
  confidence: number;
  extractedFields: string[];
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'mock';
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

// ============================================
// File Storage Types
// ============================================

export interface StorageProvider {
  upload(file: Buffer, filename: string, mimeType: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  getUrl(path: string): string;
}

export interface UploadedFile {
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
}
