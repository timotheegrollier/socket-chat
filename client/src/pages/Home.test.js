import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import socketIOClient from 'socket.io-client';
import Home from './Home';

jest.mock('axios');
jest.mock('socket.io-client', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const makeSocket = () => {
  const io = {
    on: jest.fn(),
    reconnection: jest.fn(),
    reconnectionAttempts: jest.fn(),
    reconnectionDelay: jest.fn(),
    reconnectionDelayMax: jest.fn(),
  };
  return {
    id: 'socket-test',
    connected: false,
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
    io,
  };
};

const renderHome = () => render(
  <MemoryRouter>
    <Home />
  </MemoryRouter>
);

const mockProfile = () => Promise.resolve({ data: { user: { pseudo: 'tester' } } });

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  socketIOClient.mockImplementation(makeSocket);
  localStorage.setItem('JWT', JSON.stringify({
    token: 'jwt-token',
    userId: 'user-1',
    expiry: new Date().getTime() + 3600000,
  }));
  localStorage.setItem('socket-chat-username', 'tester');
});

test('shows a detailed boot state while the first requests are pending', async () => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/secure/')) return mockProfile();
    return new Promise(() => {});
  });

  renderHome();

  expect(screen.getByText(/connecting to socket chat/i)).toBeInTheDocument();
  expect(screen.getByText('Realtime connection')).toBeInTheDocument();
  expect(screen.getAllByText('Channels').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
  expect(screen.getByText(/starting the realtime connection/i)).toBeInTheDocument();
  await waitFor(() => expect(document.querySelector('.nav-username')).toHaveTextContent('tester'));
});

test('shows an explicit error state with a retry when the server is unreachable', async () => {
  axios.get.mockImplementation((url) => (
    url.includes('/api/secure/') ? mockProfile() : Promise.reject(new Error('offline'))
  ));

  renderHome();

  expect(await screen.findByText(/can't reach the chat server/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  expect(screen.getByText(/channels unavailable/i)).toBeInTheDocument();
});

test('renders channels and messages once the server answers', async () => {
  const now = new Date().toISOString();

  axios.get.mockImplementation((url) => {
    if (url.includes('/api/secure/')) return mockProfile();
    if (url.includes('/api/channels')) {
      return Promise.resolve({
        data: {
          channels: [
            { name: 'general', createdAt: null },
            { name: 'random', createdAt: now },
          ],
        },
      });
    }
    if (url.includes('/api/messages')) {
      return Promise.resolve({
        data: {
          messages: [{
            _id: 'message-1',
            message: 'Bonjour tout le monde',
            author: 'tester',
            channel: 'general',
            createdAt: now,
          }],
        },
      });
    }
    return Promise.reject(new Error('unexpected url ' + url));
  });

  renderHome();

  expect(await screen.findByText('Bonjour tout le monde')).toBeInTheDocument();
  expect(screen.getByText('random')).toBeInTheDocument();
});
