import { apiRequest } from './client';

export const getTransactions = () => apiRequest('/transactions');
