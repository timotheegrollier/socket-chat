import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import AccountDialog from './AccountDialog';

jest.mock('axios');

const renderDialog = (props = {}) => render(
  <AccountDialog
    open
    pseudo="tester"
    token="jwt-token"
    onClose={jest.fn()}
    onProfileUpdated={jest.fn()}
    onSessionExpired={jest.fn()}
    {...props}
  />
);

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders the profile and password sections when open', () => {
  renderDialog();

  expect(screen.getByRole('dialog', { name: /account settings/i })).toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toHaveValue('tester');
  expect(screen.getByLabelText('Current password')).toBeInTheDocument();
  expect(screen.getByLabelText('New password')).toBeInTheDocument();
  expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
});

test('renders nothing when closed', () => {
  renderDialog({ open: false });

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('updates the username with the bearer token and notifies the parent', async () => {
  const onProfileUpdated = jest.fn();
  axios.put.mockResolvedValue({
    data: { user: { _id: 'user-1', pseudo: 'newtester' } },
  });

  renderDialog({ onProfileUpdated });

  const input = screen.getByLabelText('Username');
  userEvent.clear(input);
  userEvent.type(input, 'newtester');
  userEvent.click(screen.getByRole('button', { name: /save username/i }));

  expect(await screen.findByText('Username updated.')).toBeInTheDocument();
  expect(axios.put).toHaveBeenCalledWith(
    expect.stringContaining('/api/secure/account'),
    { pseudo: 'newtester' },
    expect.objectContaining({
      headers: { Authorization: 'Bearer jwt-token' },
    })
  );
  expect(onProfileUpdated).toHaveBeenCalledWith('newtester');
  expect(input).toHaveValue('newtester');
});

test('validates the username before calling the API', async () => {
  renderDialog();

  const input = screen.getByLabelText('Username');
  userEvent.clear(input);
  userEvent.type(input, 'ab');
  userEvent.click(screen.getByRole('button', { name: /save username/i }));

  expect(await screen.findByText(/between 4 and 12 characters/i)).toBeInTheDocument();
  expect(axios.put).not.toHaveBeenCalled();
});

test('shows the API error when the current password is wrong', async () => {
  axios.put.mockRejectedValue({
    response: {
      status: 400,
      data: { error: 'Current password is incorrect' },
    },
  });

  renderDialog();

  userEvent.type(screen.getByLabelText('Current password'), 'wrong-password');
  userEvent.type(screen.getByLabelText('New password'), 'newsecret42');
  userEvent.type(screen.getByLabelText('Confirm new password'), 'newsecret42');
  userEvent.click(screen.getByRole('button', { name: /update password/i }));

  expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
  expect(axios.put).toHaveBeenCalledWith(
    expect.stringContaining('/api/secure/password'),
    {
      currentPassword: 'wrong-password',
      password: 'newsecret42',
      confirmPass: 'newsecret42',
    },
    expect.objectContaining({
      headers: { Authorization: 'Bearer jwt-token' },
    })
  );
});

test('validates the password confirmation locally', async () => {
  renderDialog();

  userEvent.type(screen.getByLabelText('Current password'), 'secret42');
  userEvent.type(screen.getByLabelText('New password'), 'newsecret42');
  userEvent.type(screen.getByLabelText('Confirm new password'), 'different42');
  userEvent.click(screen.getByRole('button', { name: /update password/i }));

  expect(await screen.findByText(/new passwords don't match/i)).toBeInTheDocument();
  expect(axios.put).not.toHaveBeenCalled();
});

test('changes the password and clears the password fields', async () => {
  axios.put.mockResolvedValue({ data: { message: 'Password updated' } });

  renderDialog();

  const current = screen.getByLabelText('Current password');
  const next = screen.getByLabelText('New password');
  const confirm = screen.getByLabelText('Confirm new password');

  userEvent.type(current, 'secret42');
  userEvent.type(next, 'newsecret42');
  userEvent.type(confirm, 'newsecret42');
  userEvent.click(screen.getByRole('button', { name: /update password/i }));

  expect(await screen.findByText(/password updated\. use it/i)).toBeInTheDocument();
  expect(current).toHaveValue('');
  expect(next).toHaveValue('');
  expect(confirm).toHaveValue('');
});

test('asks the parent to log out when the session has expired', async () => {
  const onSessionExpired = jest.fn();
  axios.put.mockRejectedValue({
    response: { status: 401, data: { error: 'Your session has expired. Please log in again.' } },
  });

  renderDialog({ onSessionExpired });

  userEvent.type(screen.getByLabelText('Current password'), 'secret42');
  userEvent.type(screen.getByLabelText('New password'), 'newsecret42');
  userEvent.type(screen.getByLabelText('Confirm new password'), 'newsecret42');
  userEvent.click(screen.getByRole('button', { name: /update password/i }));

  await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
});
