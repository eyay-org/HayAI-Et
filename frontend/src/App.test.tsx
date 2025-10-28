import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('shows login screen before the app content', () => {
  render(<App />);
  expect(screen.getByText(/HayAI Sanat Platformu/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Stüdyoya Gir/i })).toBeInTheDocument();
});
