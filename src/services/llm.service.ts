/**
 * LLM Service
 * Provides AI-powered report generation with pluggable LLM providers
 */

import type { PropertyData, RiskScores, LLMProvider, LLMConfig } from '@/types';
import { formatCurrency, formatArea, getTrafficLightColor } from '@/lib/utils';

/**
 * Get the configured LLM provider
 */
export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || 'mock';

  switch (provider) {
    case 'openai':
      return new OpenAIProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'mock':
    default:
      return new MockLLMProvider();
  }
}

/**
 * OpenAI Provider Implementation
 */
class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
  }

  async generateReport(
    propertyData: PropertyData,
    riskScores: RiskScores,
    language: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = buildReportPrompt(propertyData, riskScores, language);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(language),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }
}

/**
 * Anthropic Provider Implementation
 */
class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.model = process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229';
  }

  async generateReport(
    propertyData: PropertyData,
    riskScores: RiskScores,
    language: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const prompt = buildReportPrompt(propertyData, riskScores, language);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        system: getSystemPrompt(language),
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.content[0]?.text || '';
  }
}

/**
 * Mock LLM Provider for development/testing
 */
class MockLLMProvider implements LLMProvider {
  async generateReport(
    propertyData: PropertyData,
    riskScores: RiskScores,
    language: string
  ): Promise<string> {
    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 500));

    return generateTemplateReport(propertyData, riskScores, language);
  }
}

/**
 * Build the prompt for LLM report generation
 */
function buildReportPrompt(
  propertyData: PropertyData,
  riskScores: RiskScores,
  language: string
): string {
  const summary = buildPropertySummary(propertyData);
  const riskSummary = buildRiskSummary(riskScores);

  return `
Generate a professional real estate investment risk analysis report in ${getLanguageName(language)}.

PROPERTY DATA:
${summary}

RISK ANALYSIS:
${riskSummary}

Overall Risk Score: ${riskScores.overall}/100
Traffic Light: ${riskScores.trafficLight.toUpperCase()}

Please write a comprehensive yet concise report (300-500 words) that:
1. Summarizes the key property characteristics
2. Explains each risk category and its score
3. Provides a clear recommendation based on the traffic light rating
4. Uses professional but accessible language
5. Includes specific data points from the analysis

The report should be written entirely in ${getLanguageName(language)}.
`;
}

/**
 * Get system prompt for LLM
 */
function getSystemPrompt(language: string): string {
  return `You are a professional real estate investment analyst. Your task is to write clear, objective investment risk reports in ${getLanguageName(language)}.

Guidelines:
- Be professional but accessible
- Use specific numbers and data
- Provide balanced analysis (both risks and opportunities)
- Keep recommendations actionable
- Write in ${getLanguageName(language)} throughout`;
}

/**
 * Build property summary for prompt
 */
function buildPropertySummary(data: PropertyData): string {
  const lines: string[] = [];

  if (data.name) lines.push(`Property: ${data.name}`);
  if (data.developer) lines.push(`Developer: ${data.developer}`);
  if (data.city || data.area) {
    lines.push(`Location: ${[data.area, data.city, data.country].filter(Boolean).join(', ')}`);
  }
  if (data.propertyType) lines.push(`Type: ${data.propertyType}`);
  if (data.bedrooms !== undefined) lines.push(`Bedrooms: ${data.bedrooms}`);
  if (data.bathrooms !== undefined) lines.push(`Bathrooms: ${data.bathrooms}`);
  if (data.areaSqFt) lines.push(`Size: ${formatArea(data.areaSqFt, 'sqft')}`);
  if (data.price && data.currency) {
    lines.push(`Price: ${formatCurrency(data.price, data.currency)}`);
  }
  if (data.pricePerSqFt) {
    lines.push(`Price/sqft: ${formatCurrency(data.pricePerSqFt, data.currency || 'AED')}`);
  }
  if (data.status) lines.push(`Status: ${data.status}`);
  if (data.handoverDate) lines.push(`Handover: ${data.handoverDate}`);
  if (data.paymentPlan) {
    const pp = data.paymentPlan;
    const planParts: string[] = [];
    if (pp.downPayment) planParts.push(`${pp.downPayment}% down`);
    if (pp.duringConstruction) planParts.push(`${pp.duringConstruction}% during construction`);
    if (pp.onHandover) planParts.push(`${pp.onHandover}% on handover`);
    if (pp.postHandover) planParts.push(`${pp.postHandover}% post-handover`);
    if (planParts.length > 0) lines.push(`Payment Plan: ${planParts.join(', ')}`);
  }
  if (data.amenities && data.amenities.length > 0) {
    lines.push(`Amenities: ${data.amenities.slice(0, 5).join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Build risk summary for prompt
 */
function buildRiskSummary(scores: RiskScores): string {
  const categories = [
    { name: 'Developer Risk', data: scores.developer },
    { name: 'Location Risk', data: scores.location },
    { name: 'Construction Risk', data: scores.construction },
    { name: 'Market Risk', data: scores.market },
    { name: 'Regulatory Risk', data: scores.regulatory },
  ];

  return categories
    .map((cat) => {
      const factors = cat.data.factors
        .map((f) => `  - ${f.description} (${f.impact})`)
        .join('\n');
      return `${cat.name}: ${cat.data.score}/100\n${cat.data.summary}\nFactors:\n${factors}`;
    })
    .join('\n\n');
}

/**
 * Generate template-based report (for mock provider)
 */
function generateTemplateReport(
  propertyData: PropertyData,
  riskScores: RiskScores,
  language: string
): string {
  const templates = getReportTemplates(language);
  const t = templates;

  const location = [propertyData.area, propertyData.city, propertyData.country]
    .filter(Boolean)
    .join(', ');

  const trafficLightText = {
    green: t.trafficLight.green,
    yellow: t.trafficLight.yellow,
    red: t.trafficLight.red,
  }[riskScores.trafficLight];

  const riskLevel = riskScores.overall <= 35 ? t.riskLevel.low :
                   riskScores.overall <= 65 ? t.riskLevel.medium : t.riskLevel.high;

  let report = `# ${t.title}\n\n`;

  // Property Summary
  report += `## ${t.sections.summary}\n\n`;
  if (propertyData.name) report += `**${t.fields.property}:** ${propertyData.name}\n`;
  if (propertyData.developer) report += `**${t.fields.developer}:** ${propertyData.developer}\n`;
  if (location) report += `**${t.fields.location}:** ${location}\n`;
  if (propertyData.propertyType) report += `**${t.fields.type}:** ${propertyData.propertyType}\n`;
  if (propertyData.bedrooms !== undefined) report += `**${t.fields.bedrooms}:** ${propertyData.bedrooms}\n`;
  if (propertyData.areaSqFt) report += `**${t.fields.size}:** ${formatArea(propertyData.areaSqFt, 'sqft')}\n`;
  if (propertyData.price) {
    report += `**${t.fields.price}:** ${formatCurrency(propertyData.price, propertyData.currency || 'AED')}\n`;
  }
  if (propertyData.handoverDate) report += `**${t.fields.handover}:** ${propertyData.handoverDate}\n`;
  report += '\n';

  // Risk Analysis
  report += `## ${t.sections.riskAnalysis}\n\n`;
  report += `**${t.fields.overallScore}:** ${riskScores.overall}/100 (${riskLevel})\n\n`;

  const categories = [
    { key: 'developer', label: t.categories.developer, data: riskScores.developer },
    { key: 'location', label: t.categories.location, data: riskScores.location },
    { key: 'construction', label: t.categories.construction, data: riskScores.construction },
    { key: 'market', label: t.categories.market, data: riskScores.market },
    { key: 'regulatory', label: t.categories.regulatory, data: riskScores.regulatory },
  ];

  for (const cat of categories) {
    const color = getTrafficLightColor(cat.data.score);
    const emoji = color === 'green' ? '🟢' : color === 'yellow' ? '🟡' : '🔴';
    report += `### ${cat.label} ${emoji}\n`;
    report += `**${t.fields.score}:** ${cat.data.score}/100\n\n`;
    report += `${cat.data.summary}\n\n`;
  }

  // Recommendation
  report += `## ${t.sections.recommendation}\n\n`;
  const emoji = riskScores.trafficLight === 'green' ? '🟢' : riskScores.trafficLight === 'yellow' ? '🟡' : '🔴';
  report += `**${t.fields.rating}:** ${emoji} ${trafficLightText}\n\n`;
  report += `${t.recommendations[riskScores.trafficLight]}\n`;

  return report;
}

/**
 * Get language name from code
 */
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    ru: 'Russian',
    ar: 'Arabic',
    zh: 'Chinese',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    it: 'Italian',
    pt: 'Portuguese',
    hi: 'Hindi',
    ja: 'Japanese',
    ko: 'Korean',
    tr: 'Turkish',
    nl: 'Dutch',
    pl: 'Polish',
  };
  return languages[code] || 'English';
}

/**
 * Report templates for different languages
 */
interface ReportTemplates {
  title: string;
  sections: {
    summary: string;
    riskAnalysis: string;
    recommendation: string;
  };
  fields: {
    property: string;
    developer: string;
    location: string;
    type: string;
    bedrooms: string;
    size: string;
    price: string;
    handover: string;
    overallScore: string;
    score: string;
    rating: string;
  };
  categories: {
    developer: string;
    location: string;
    construction: string;
    market: string;
    regulatory: string;
  };
  trafficLight: {
    green: string;
    yellow: string;
    red: string;
  };
  riskLevel: {
    low: string;
    medium: string;
    high: string;
  };
  recommendations: {
    green: string;
    yellow: string;
    red: string;
  };
}

function getReportTemplates(language: string): ReportTemplates {
  const templates: Record<string, ReportTemplates> = {
    en: {
      title: 'Property Investment Risk Analysis',
      sections: {
        summary: 'Property Summary',
        riskAnalysis: 'Risk Analysis',
        recommendation: 'Recommendation',
      },
      fields: {
        property: 'Property',
        developer: 'Developer',
        location: 'Location',
        type: 'Type',
        bedrooms: 'Bedrooms',
        size: 'Size',
        price: 'Price',
        handover: 'Handover',
        overallScore: 'Overall Risk Score',
        score: 'Score',
        rating: 'Rating',
      },
      categories: {
        developer: 'Developer Risk',
        location: 'Location Risk',
        construction: 'Construction Risk',
        market: 'Market Risk',
        regulatory: 'Regulatory Risk',
      },
      trafficLight: {
        green: 'Low Risk - Recommended',
        yellow: 'Medium Risk - Proceed with Caution',
        red: 'High Risk - Not Recommended',
      },
      riskLevel: {
        low: 'Low Risk',
        medium: 'Medium Risk',
        high: 'High Risk',
      },
      recommendations: {
        green: 'This property presents a favorable risk profile and is suitable for most investors. The combination of reputable developer, strong location, and reasonable timeline suggests a solid investment opportunity. Standard due diligence is recommended.',
        yellow: 'This property shows moderate risk factors that warrant careful consideration. We recommend additional due diligence on the specific concerns highlighted above. Consider your risk tolerance and investment timeline before proceeding.',
        red: 'This property presents significant risk factors that make it unsuitable for risk-averse investors. Only consider if you have high risk tolerance, can afford potential losses, and have conducted thorough independent verification of all claims.',
      },
    },
    ru: {
      title: 'Анализ рисков инвестиций в недвижимость',
      sections: {
        summary: 'Информация об объекте',
        riskAnalysis: 'Анализ рисков',
        recommendation: 'Рекомендация',
      },
      fields: {
        property: 'Объект',
        developer: 'Застройщик',
        location: 'Расположение',
        type: 'Тип',
        bedrooms: 'Спальни',
        size: 'Площадь',
        price: 'Цена',
        handover: 'Сдача',
        overallScore: 'Общий риск',
        score: 'Оценка',
        rating: 'Рейтинг',
      },
      categories: {
        developer: 'Риск застройщика',
        location: 'Риск локации',
        construction: 'Строительный риск',
        market: 'Рыночный риск',
        regulatory: 'Регуляторный риск',
      },
      trafficLight: {
        green: 'Низкий риск - Рекомендуется',
        yellow: 'Средний риск - Требует внимания',
        red: 'Высокий риск - Не рекомендуется',
      },
      riskLevel: {
        low: 'Низкий',
        medium: 'Средний',
        high: 'Высокий',
      },
      recommendations: {
        green: 'Данный объект имеет благоприятный профиль риска и подходит для большинства инвесторов. Сочетание надежного застройщика, хорошего расположения и разумных сроков указывает на хорошую инвестиционную возможность. Рекомендуется стандартная проверка.',
        yellow: 'Данный объект имеет умеренные факторы риска, требующие внимательного рассмотрения. Рекомендуем дополнительную проверку по указанным выше проблемам. Учитывайте вашу склонность к риску перед принятием решения.',
        red: 'Данный объект имеет значительные факторы риска, делающие его непригодным для консервативных инвесторов. Рассматривайте только при высокой толерантности к риску и после тщательной независимой проверки.',
      },
    },
  };

  return templates[language] || templates.en;
}

export { generateTemplateReport, buildPropertySummary, buildRiskSummary };
