import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

test('renders the login screen when there is no session', () => {
  render(<App />);
  expect(screen.getByText(/you need to login/i)).toBeInTheDocument();
});
