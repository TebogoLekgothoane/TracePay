import { apiRequest } from './client';

export const getNotifications = () => apiRequest('/notifications');
