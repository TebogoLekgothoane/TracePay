import { apiRequest } from './client';

export const getLeaks = () => apiRequest('/leaks');
