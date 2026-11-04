import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import About from './About';

test('announces version 2.0 and displays the current build version', () => {
  render(
    <MemoryRouter initialEntries={['/about']}>
      <About />
    </MemoryRouter>
  );

  const versionLabels = screen.getAllByText(/version 2\.0\.0/i);
  expect(versionLabels.length).toBeGreaterThan(0);
  expect(screen.getByText(/what's new in 2\.0/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /open the chat/i })).toBeInTheDocument();
});
