import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Login from './Login';

jest.mock('axios');

const fillForm = (pseudo, password) => {
  fireEvent.change(document.getElementById('pseudo'), { target: { value: pseudo } });
  fireEvent.change(document.getElementById('password'), { target: { value: password } });
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test('caches the pseudo returned by the API at login', async () => {
  axios.post.mockResolvedValue({
    data: { token: 'jwt-token', userId: 'user-1', pseudo: 'tester' },
  });
  const getLogged = jest.fn();

  render(
    <MemoryRouter>
      <Login getLogged={getLogged} />
    </MemoryRouter>
  );

  fillForm('tester', 'secret');
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));

  await waitFor(() => expect(getLogged).toHaveBeenCalledWith(true));
  expect(localStorage.getItem('socket-chat-username')).toBe('tester');
  expect(JSON.parse(localStorage.getItem('JWT'))).toMatchObject({
    token: 'jwt-token',
    userId: 'user-1',
  });
});

test('falls back to the typed pseudo when the API does not return one', async () => {
  axios.post.mockResolvedValue({
    data: { token: 'jwt-token', userId: 'user-1' },
  });
  const getLogged = jest.fn();

  render(
    <MemoryRouter>
      <Login getLogged={getLogged} />
    </MemoryRouter>
  );

  fillForm('legacyuser', 'secret');
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));

  await waitFor(() => expect(getLogged).toHaveBeenCalledWith(true));
  expect(localStorage.getItem('socket-chat-username')).toBe('legacyuser');
});
