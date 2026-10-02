import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  setCurrentUser,
} from '@/lib/auth';
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  User,
  TaxReturn,
  TaxReturnCreateRequest,
  Document as TaxDocument,
  TaxProfile,
  TaxCalculation,
  TaxQuestion,
  Canton,
  Municipality,
  ProfileUpdateRequest,
  PasswordChangeRequest,
  DocumentUploadResponse,
  PaginatedResponse,
  AiTaxGuideResponse,
} from '@/types';

// ─── Axios Instance ───────────────────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30_000,
});

// ─── Request Interceptor ──────────────────────────────────────────────────────

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response Interceptor (401 → refresh → retry) ────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        clearTokens();
        processQueue(error);
        isRefreshing = false;
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      try {
        const response = await axios.post<{ access_token: string; refresh_token: string }>(
          `${BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken },
        );
        const { access_token, refresh_token } = response.data;
        setTokens(access_token, refresh_token);
        processQueue(null, access_token);

        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        clearTokens();
        processQueue(refreshError);
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  /**
   * Authenticates the user and stores tokens.
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    // The FastAPI endpoint accepts a JSON `UserLoginRequest`, not an OAuth2
    // form payload. Sending JSON keeps client and server validation aligned.
    const response = await apiClient.post<LoginResponse>('/auth/login', data);
    const { access_token, refresh_token } = response.data;
    setTokens(access_token, refresh_token);
    // The token endpoint deliberately returns credentials only. Fetching the
    // current user afterwards keeps browser state aligned with the API.
    const userResponse = await apiClient.get<User>('/auth/me');
    setCurrentUser(userResponse.data);
    return { ...response.data, user: userResponse.data };
  },

  /**
   * Registers a new user account.
   */
  async register(data: RegisterRequest): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/auth/register', data);
    return response.data;
  },

  /**
   * Logs out the user and clears tokens.
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      clearTokens();
    }
  },

  /**
   * Refreshes the access token using the refresh token.
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const response = await apiClient.post<{ access_token: string; refresh_token: string }>(
      '/auth/refresh',
      { refresh_token: refreshToken },
    );
    return response.data;
  },

  /**
   * Returns the currently authenticated user.
   */
  async getMe(): Promise<User> {
    const response = await apiClient.get<User>('/auth/me');
    setCurrentUser(response.data);
    return response.data;
  },

  /**
   * Sends a password reset email.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/auth/forgot-password', { email });
    return response.data;
  },

  /**
   * Resets the password with a token from email.
   */
  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/auth/reset-password', {
      token,
      password,
    });
    return response.data;
  },

  /**
   * Verifies the user's email with a token from the verification link.
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/auth/verify-email', { token });
    return response.data;
  },

  /**
   * Updates the current user's profile.
   */
  async updateProfile(data: ProfileUpdateRequest): Promise<User> {
    const response = await apiClient.patch<User>('/auth/me', data);
    setCurrentUser(response.data);
    return response.data;
  },

  /**
   * Changes the user's password.
   */
  async changePassword(data: PasswordChangeRequest): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/auth/change-password', data);
    return response.data;
  },

  /**
   * Permanently deletes the user's account.
   */
  async deleteAccount(password: string): Promise<void> {
    await apiClient.delete('/auth/me', { data: { password } });
    clearTokens();
  },

  /**
   * Requests a data export (GDPR).
   */
  async exportData(): Promise<Blob> {
    const response = await apiClient.get('/auth/me/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};

// ─── Tax Returns API ──────────────────────────────────────────────────────────

export const taxReturnsApi = {
  /**
   * Lists all tax returns for the current user.
   */
  async list(params?: { page?: number; size?: number }): Promise<PaginatedResponse<TaxReturn>> {
    const response = await apiClient.get<PaginatedResponse<TaxReturn>>('/tax-returns', {
      params,
    });
    return response.data;
  },

  /**
   * Creates a new tax return.
   */
  async create(data: TaxReturnCreateRequest): Promise<TaxReturn> {
    const response = await apiClient.post<TaxReturn>('/tax-returns', data);
    return response.data;
  },

  /**
   * Gets a single tax return by ID.
   */
  async get(id: string): Promise<TaxReturn> {
    const response = await apiClient.get<TaxReturn>(`/tax-returns/${id}`);
    return response.data;
  },

  /**
   * Deletes a tax return by ID.
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tax-returns/${id}`);
  },

  /**
   * Submits a tax return for official filing.
   */
  async submit(id: string): Promise<TaxReturn> {
    const response = await apiClient.post<TaxReturn>(`/tax-returns/${id}/submit`);
    return response.data;
  },
};

// ─── Cantons API ──────────────────────────────────────────────────────────────

export const cantonsApi = {
  /**
   * Lists all supported Swiss cantons.
   */
  async list(): Promise<Canton[]> {
    const response = await apiClient.get<Canton[]>('/cantons');
    return response.data;
  },

  /**
   * Gets municipalities for a specific canton, optionally filtered by search term.
   */
  async getMunicipalities(
    cantonCode: string,
    search?: string,
  ): Promise<Municipality[]> {
    const response = await apiClient.get<Municipality[]>(
      `/cantons/${cantonCode}/municipalities`,
      { params: { search } },
    );
    return response.data;
  },
};

// ─── Documents API ────────────────────────────────────────────────────────────

export const documentsApi = {
  /**
   * Uploads a document file for a tax return.
   */
  async upload(
    taxReturnId: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('files', file);

    const response = await apiClient.post<DocumentUploadResponse[]>(
      `/documents/upload`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: taxReturnId ? { tax_return_id: taxReturnId } : undefined,
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            onProgress(percent);
          }
        },
      },
    );
    return response.data[0]!;
  },

  /**
   * Lists all documents for a tax return.
   */
  async list(taxReturnId?: string): Promise<TaxDocument[]> {
    const response = await apiClient.get<{ items: TaxDocument[] }>('/documents', {
      params: taxReturnId ? { tax_return_id: taxReturnId } : undefined,
    });
    return response.data.items;
  },

  /**
   * Gets a single document by ID.
   */
  async get(documentId: string): Promise<TaxDocument> {
    const response = await apiClient.get<TaxDocument>(`/documents/${documentId}`);
    return response.data;
  },

  /**
   * Deletes a document by ID.
   */
  async delete(documentId: string): Promise<void> {
    await apiClient.delete(`/documents/${documentId}`);
  },

  /**
   * Gets a pre-signed download URL for a document.
   */
  async getDownloadUrl(documentId: string): Promise<{ url: string; expires_in: number }> {
    const response = await apiClient.get<{ url: string; expires_in: number }>(
      `/documents/${documentId}/download-url`,
    );
    return response.data;
  },

  /**
   * Gets the processing status of a document.
   */
  async getStatus(documentId: string): Promise<{ status: string; progress: number; message?: string }> {
    const response = await apiClient.get<{ status: string; progress: number; message?: string }>(
      `/documents/${documentId}/status`,
    );
    return response.data;
  },
};

// ─── Tax Profile API ──────────────────────────────────────────────────────────

export const taxProfileApi = {
  /**
   * Gets the tax profile for a tax return.
   */
  async get(taxReturnId: string): Promise<TaxProfile> {
    const response = await apiClient.get<TaxProfile>(
      `/tax-returns/${taxReturnId}/profile`,
    );
    const profile = response.data
    return {
      ...profile,
      questions: profile.tax_questions ?? profile.questions ?? [],
      flags: profile.tax_flags ?? profile.flags ?? [],
      income: profile.income_data ?? profile.income ?? {},
      wealth: profile.wealth_data ?? profile.wealth ?? {},
      deductions: profile.deductions_data ?? profile.deductions ?? {},
      liabilities: profile.liabilities_data ?? profile.liabilities ?? {},
      securities: (profile.wealth_data as any)?.securities ?? profile.securities ?? [],
    };
  },

  /**
   * Updates fields in the tax profile.
   */
  async update(
    taxReturnId: string,
    sectionOrProfile: 'personal_data' | 'income_data' | 'wealth_data' | 'deductions_data' | TaxProfile,
    data?: Record<string, unknown>,
  ): Promise<TaxProfile> {
    const response = await apiClient.patch<TaxProfile>(
      `/tax-returns/${taxReturnId}/profile`,
      typeof sectionOrProfile === 'string'
        ? { [sectionOrProfile]: data ?? {} }
        : {
            personal_data: sectionOrProfile.personal_data,
            income_data: sectionOrProfile.income_data,
            wealth_data: sectionOrProfile.wealth_data,
            deductions_data: sectionOrProfile.deductions_data,
            liabilities_data: sectionOrProfile.liabilities_data,
            notes: sectionOrProfile.notes,
          },
    );
    return response.data;
  },

  /**
   * Gets AI-generated questions for a tax return.
   */
  async getQuestions(taxReturnId: string): Promise<TaxQuestion[]> {
    const response = await apiClient.get<TaxQuestion[]>(
      `/tax-returns/${taxReturnId}/questions`,
    );
    return response.data;
  },

  /**
   * Submits an answer to a question.
   */
  async answerQuestion(
    taxReturnId: string,
    questionId: string,
    answer: string,
  ): Promise<TaxQuestion> {
    const response = await apiClient.post<TaxQuestion>(
      `/tax-returns/${taxReturnId}/questions/${questionId}/answer`,
      { answer },
    );
    return response.data;
  },

  /**
   * Submits all answers and triggers profile update.
   */
  async submitAnswers(
    taxReturnId: string,
    answers: Record<string, string>,
  ): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(
      `/tax-returns/${taxReturnId}/questions/submit`,
      { answers },
    );
    return response.data;
  },

  async answerQuestions(taxReturnId: string, answers: Record<string, string>): Promise<{ message: string }> {
    return this.submitAnswers(taxReturnId, answers);
  },
};

// ─── Tax Engine API ───────────────────────────────────────────────────────────

export const taxEngineApi = {
  /**
   * Triggers a tax calculation for a tax return.
   */
  async calculate(taxReturnId: string): Promise<{ task_id: string; message: string }> {
    const response = await apiClient.post<{ task_id: string; message: string }>(
      `/tax-returns/${taxReturnId}/calculate`,
    );
    return response.data;
  },

  /**
   * Gets the most recent calculation result for a tax return.
   */
  async getCalculation(taxReturnId: string): Promise<TaxCalculation> {
    const response = await apiClient.get<TaxCalculation>(
      `/tax-returns/${taxReturnId}/calculation`,
    );
    return response.data;
  },

  /**
   * Exports the tax return as a PDF.
   */
  async exportPdf(taxReturnId: string): Promise<Blob> {
    const response = await apiClient.post(`/tax-returns/${taxReturnId}/export/pdf`, undefined, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Exports the tax return as an eCH-0093 XML file.
   */
  async exportXml(taxReturnId: string): Promise<Blob> {
    const response = await apiClient.post(`/tax-returns/${taxReturnId}/export/xml`, undefined, {
      responseType: 'blob',
    });
    return response.data;
  },

  async confirm(taxReturnId: string, confirmation_text: string): Promise<{ message: string; status: string }> {
    const response = await apiClient.post<{ message: string; status: string }>(
      `/tax-returns/${taxReturnId}/confirm`,
      { confirmation_text },
    );
    return response.data;
  },

  async calculateCommuting(taxReturnId: string, payload: any): Promise<any> {
    const response = await apiClient.post(`/tax-returns/${taxReturnId}/tools/commuting`, payload);
    return response.data;
  },

  async lookupIctax(taxReturnId: string, payload: { identifier: string; quantity?: number }): Promise<any> {
    const response = await apiClient.post(`/tax-returns/${taxReturnId}/tools/ictax`, payload);
    return response.data;
  },

  async evaluateCrypto(taxReturnId: string, payload: { symbol: string; quantity: number }): Promise<any> {
    const response = await apiClient.post(`/tax-returns/${taxReturnId}/tools/crypto`, payload);
    return response.data;
  },
};

// ─── AI Assistant API ─────────────────────────────────────────────────────────

export const aiAssistantApi = {
  /**
   * Retrieves the AI Submission Guide and readiness audit for a tax return.
   */
  async getGuide(taxReturnId: string): Promise<AiTaxGuideResponse> {
    const response = await apiClient.get<AiTaxGuideResponse>(
      `/tax-returns/${taxReturnId}/guide`,
    );
    return response.data;
  },

  /**
   * Sends a message to the AI tax assistant.
   * For streaming, use the WebSocket connection instead.
   */
  async sendMessage(
    taxReturnId: string,
    message: string,
  ): Promise<{ message: string; response: string; suggestions?: string[]; next_step?: string }> {
    const response = await apiClient.post<{ message: string; response: string; suggestions?: string[]; next_step?: string }>(
      `/tax-returns/${taxReturnId}/chat`,
      { message },
    );
    return response.data;
  },

  /**
   * Gets the chat history for a tax return's assistant.
   */
  async getHistory(
    taxReturnId: string,
  ): Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }>> {
    const response = await apiClient.get<
      Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }>
    >(`/tax-returns/${taxReturnId}/chat/history`);
    return response.data;
  },

  /**
   * Clears the chat history for a tax return's assistant.
   */
  async clearHistory(taxReturnId: string): Promise<void> {
    await apiClient.delete(`/tax-returns/${taxReturnId}/chat/history`);
  },
};

// Compatibility facade used by the application pages and feature components.
// Keep the domain clients above as the single implementation; this object
// provides the stable `api.<domain>.<method>` contract used by the UI.
export const api = {
  auth: authApi,
  taxReturns: taxReturnsApi,
  cantons: cantonsApi,
  documents: documentsApi,
  taxProfile: taxProfileApi,
  taxEngine: taxEngineApi,
  aiAssistant: aiAssistantApi,
};

export default apiClient;
