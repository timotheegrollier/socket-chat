import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import About from './About';
import { version } from '../../package.json';

test('announces version 2.x and displays the current build version', () => {
  render(
    <MemoryRouter initialEntries={['/about']}>
      <About />
    </MemoryRouter>
  );

  const escaped = version.replace(/\./g, '\\.');
  const versionLabels = screen.getAllByText(new RegExp(`version ${escaped}`, 'i'));
  expect(versionLabels.length).toBeGreaterThan(0);
  expect(screen.getByText(/what's new in 2\.x/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /open the chat/i })).toBeInTheDocument();
});
