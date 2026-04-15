import axios from "axios";

const getApiUrl = () => {
  if (window.location.hostname.includes('logitrak.ch')) {
    return `https://${window.location.hostname}/api`;
  }
  return process.env.REACT_APP_BACKEND_URL 
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : '/api';
};

export const API = getApiUrl();
export const api = axios;
