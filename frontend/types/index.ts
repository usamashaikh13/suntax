/**
 * TypeScript types for SunTax platform, aligned with backend Pydantic schemas.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum DocumentType {
  SALARY_STATEMENT = 'salary_statement',
  BANK_STATEMENT = 'bank_statement',
  SECURITIES_STATEMENT = 'securities_statement',
  REAL_ESTATE_DOCUMENT = 'real_estate_document',
  INSURANCE_CERTIFICATE = 'insurance_certificate',
  PENSION_STATEMENT = 'pension_statement',
  DIVIDEND_STATEMENT = 'dividend_statement',
  INTEREST_STATEMENT = 'interest_statement',
  RENTAL_INCOME = 'rental_income',
  BUSINESS_INCOME = 'business_income',
  MEDICAL_EXPENSES = 'medical_expenses',
  CHARITABLE_DONATION = 'charitable_donation',
  MORTGAGE_STATEMENT = 'mortgage_statement',
  TAX_ASSESSMENT = 'tax_assessment',
  OTHER = 'other',
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  MANUAL_REVIEW = 'manual_review',
}

export enum TaxReturnStatus {
  DRAFT = 'draft',
  DOCUMENTS_UPLOADED = 'documents_uploaded',
  PROCESSING = 'processing',
  QUESTIONS_PENDING = 'questions_pending',
  CALCULATING = 'calculating',
  REVIEW = 'review',
  COMPLETED = 'completed',
  CONFIRMED = 'confirmed',
  SUBMITTED = 'submitted',
  ERROR = 'error',
}

export enum ConfidenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  UNCERTAIN = 'uncertain',
}

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Canton {
  code: string;         // e.g. 'ZH', 'BE', 'GE'
  name: string;
  name_de: string;      // German name
  name_fr: string;      // French name
  name_it: string;      // Italian name
  name_en: string;      // English name
  supported: boolean;
}

export interface Municipality {
  code: string;
  id: number;
  name: string;
  canton_code: string;
  bfs_number: number;   // Swiss Federal Statistical Office number
  tax_multiplier?: number;
}

export interface TaxReturn {
  id: string;
  user_id: string;
  canton_code: string;
  municipality_id: number;
  municipality_code?: string;
  municipality_name?: string;
  tax_year: number;
  status: TaxReturnStatus;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  confirmed_at?: string;
  completion_percentage: number;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  tax_return_id: string;
  user_id: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  document_type: DocumentType | null;
  processing_status: string;
  classification_confidence: number | null;
  is_duplicate_suspect: boolean;
  extracted_data: Record<string, unknown> | null;
  extraction_confidence?: Record<string, unknown> | null;
  uploaded_at: string;
  processed_at?: string | null;
  download_url?: string;
}

export interface DocumentUploadResponse {
  document: Document;
  task_id: string;
}

// ─── Tax Profile Data ─────────────────────────────────────────────────────────

export interface ExtractedField<T = string | number | boolean | null> {
  value: T;
  confidence: ConfidenceLevel;
  source_document_id?: string;
  source_document_name?: string;
  is_manually_entered: boolean;
  has_conflict: boolean;
  conflict_values?: Array<{ value: T; document_id: string; document_name: string }>;
}

export interface PersonalData {
  first_name: ExtractedField<string>;
  last_name: ExtractedField<string>;
  date_of_birth: ExtractedField<string>;
  ahv_number: ExtractedField<string>;    // Swiss social security number
  civil_status: ExtractedField<string>;  // single, married, divorced, widowed
  address_street: ExtractedField<string>;
  address_zip: ExtractedField<string>;
  address_city: ExtractedField<string>;
  nationality: ExtractedField<string>;
  permit_type: ExtractedField<string | null>;  // B, C, L, etc.
  profession: ExtractedField<string>;
  employer_name: ExtractedField<string>;
  denomination: ExtractedField<string | null>;  // for church tax
}

export interface IncomeData {
  gross_salary: ExtractedField<number>;
  net_salary: ExtractedField<number>;
  bonus: ExtractedField<number>;
  overtime_pay: ExtractedField<number>;
  self_employment_income: ExtractedField<number>;
  rental_income: ExtractedField<number>;
  dividend_income: ExtractedField<number>;
  interest_income: ExtractedField<number>;
  pension_income: ExtractedField<number>;
  other_income: ExtractedField<number>;
  total_income: ExtractedField<number>;
}

export interface SecurityPosition {
  isin: string;
  name: string;
  quantity: number;
  price_chf: number;
  total_value_chf: number;
  dividend_chf: number;
  currency: string;
}

export interface RealEstateProperty {
  address: string;
  canton: string;
  municipality: string;
  official_value: number;
  rental_value: number;         // Eigenmietwert
  net_rental_income: number;
  mortgage_debt: number;
  is_primary_residence: boolean;
  ownership_percentage: number;
}

export interface WealthData {
  bank_accounts: ExtractedField<number>;
  securities_value: ExtractedField<number>;
  securities_positions: SecurityPosition[];
  real_estate_value: ExtractedField<number>;
  real_estate_properties: RealEstateProperty[];
  vehicle_value: ExtractedField<number>;
  life_insurance_value: ExtractedField<number>;
  pension_pillar3a: ExtractedField<number>;
  other_assets: ExtractedField<number>;
  total_assets: ExtractedField<number>;
  total_debts: ExtractedField<number>;
  net_wealth: ExtractedField<number>;
}

export interface DeductionsData {
  // Standard deductions
  professional_expenses: ExtractedField<number>;
  commute_costs: ExtractedField<number>;
  meal_allowance: ExtractedField<number>;
  other_professional_expenses: ExtractedField<number>;
  // Insurance premiums
  health_insurance_premiums: ExtractedField<number>;
  accident_insurance_premiums: ExtractedField<number>;
  // Pillar 3a contributions
  pillar3a_contributions: ExtractedField<number>;
  // Pillar 2 contributions
  pillar2_contributions: ExtractedField<number>;
  // Debt interest
  debt_interest: ExtractedField<number>;
  // Charitable donations
  donations: ExtractedField<number>;
  // Medical expenses (above deductible)
  medical_expenses: ExtractedField<number>;
  // Childcare / alimony
  childcare_costs: ExtractedField<number>;
  alimony_paid: ExtractedField<number>;
  // Other
  other_deductions: ExtractedField<number>;
  total_deductions: ExtractedField<number>;
}

export interface TaxProfile {
  id: string;
  tax_return_id: string;
  personal_data: Partial<PersonalData>;
  income_data: Partial<IncomeData>;
  wealth_data: Partial<WealthData>;
  deductions_data: Partial<DeductionsData>;
  liabilities_data?: Record<string, unknown> | null;
  tax_questions?: TaxQuestion[] | null;
  tax_flags?: TaxFlag[] | null;
  completeness_score?: number | null;
  notes?: string | null;
  is_complete?: boolean;
  completion_percentage?: number;
  updated_at: string;
  // Aliases support profile payloads created by earlier processing versions.
  questions?: TaxQuestion[];
  flags?: TaxFlag[];
  income?: Record<string, unknown>;
  wealth?: Record<string, unknown>;
  deductions?: Record<string, unknown>;
  liabilities?: Record<string, unknown>;
  securities?: Array<Record<string, unknown>>;
}

// ─── Questions ────────────────────────────────────────────────────────────────

export enum QuestionCategory {
  PERSONAL = 'personal',
  INCOME = 'income',
  WEALTH = 'wealth',
  DEDUCTIONS = 'deductions',
  LIABILITIES = 'liabilities',
  SPECIAL = 'special',
}

export interface TaxQuestion {
  id: string;
  tax_return_id: string;
  category: QuestionCategory;
  question_text: string;
  question_text_de: string;
  field_key: string;
  answer: string | null;
  answer_type: 'text' | 'number' | 'boolean' | 'date' | 'select';
  options?: string[];  // For select type
  is_required: boolean;
  is_answered: boolean;
  help_text?: string;
  created_at: string;
}

export interface TaxFlag {
  id: string;
  tax_return_id: string;
  flag_type: 'warning' | 'error' | 'info' | 'suggestion';
  title: string;
  description: string;
  field_key?: string;
  is_resolved: boolean;
  created_at: string;
}

// ─── Tax Calculation ──────────────────────────────────────────────────────────

export interface TaxBracket {
  taxable_income_from: number;
  taxable_income_to: number | null;
  rate_percent: number;
  tax_amount: number;
}

export interface TaxComponent {
  label: string;
  taxable_amount: number;
  rate_applied: number;
  tax_amount: number;
  deductions_applied: number;
  brackets?: TaxBracket[];
  legal_basis?: string;
}

export interface TaxCalculation {
  id: string;
  tax_return_id: string;
  tax_year: number;
  canton_code: string;
  municipality_id: number;

  // Input figures
  gross_income: number;
  total_deductions: number;
  taxable_income: number;
  total_wealth: number;
  total_debts: number;
  taxable_wealth: number;

  // Federal tax (Direkte Bundessteuer)
  federal_income_tax: number;
  federal_tax_components: TaxComponent[];

  // Cantonal tax (Kantonssteuer)
  cantonal_income_tax: number;
  cantonal_wealth_tax: number;
  cantonal_tax_components: TaxComponent[];
  cantonal_multiplier: number;

  // Municipal tax (Gemeindesteuer)
  municipal_income_tax: number;
  municipal_wealth_tax: number;
  municipal_multiplier: number;

  // Church tax (Kirchensteuer)
  church_tax: number | null;

  // Total
  total_tax: number;
  effective_tax_rate: number;

  calculation_date: string;
  is_estimate: boolean;
  flags: TaxFlag[];
}

// ─── API Request/Response ─────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface TaxReturnCreateRequest {
  canton_code: string;
  municipality_code?: string;
  municipality_name?: string;
  tax_year: number;
}

export interface ProfileUpdateRequest {
  full_name?: string;
  email?: string;
}

export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
}

export interface ApiError {
  detail: string;
  code?: string;
  field?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ─── WebSocket Messages ───────────────────────────────────────────────────────

export type WSMessageType =
  | 'document_processing_started'
  | 'document_processing_progress'
  | 'document_processing_completed'
  | 'document_processing_failed'
  | 'tax_profile_updated'
  | 'question_generated'
  | 'calculation_completed'
  | 'status_changed'
  | 'ai_message'
  | 'ai_message_chunk'
  | 'ai_message_done'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface DocumentProgressPayload {
  document_id: string;
  progress: number;
  stage: string;
  message?: string;
}

export interface AIMessagePayload {
  message_id: string;
  content: string;
  is_final: boolean;
}

// ─── AI Tax Guide & Submission ───────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'in_progress' | 'pending' | 'action_needed';
  category: string;
  action_tab: string;
}

export interface DeductionOpportunity {
  title: string;
  max_amount_chf: number | null;
  estimated_saving_chf: number | null;
  description: string;
  status: 'claimed' | 'available' | 'optimized';
}

export interface AiTaxGuideResponse {
  tax_return_id: string;
  canton_code: string;
  canton_name: string;
  tax_year: number;
  readiness_score: number;
  current_phase: 'documents' | 'deductions' | 'questions' | 'calculation' | 'submission' | 'completed';
  phase_title: string;
  next_recommended_action: string;
  next_tab: string;
  ai_summary: string;
  checklist: ChecklistItem[];
  deduction_opportunities: DeductionOpportunity[];
  official_submission_instructions: string;
  is_ready_to_submit: boolean;
}
