/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResetPasswordPage from '../page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function setUrl(search: string) {
  // jsdom's window.location descriptor isn't reconfigurable, so navigate via
  // the History API instead of redefining the property.
  window.history.pushState(null, '', `/reset-password${search}`);
}

beforeEach(() => {
  global.fetch = jest.fn();
  setUrl('?token_hash=valid-token&type=recovery');
});

describe('ResetPasswordPage', () => {
  test('shows an error and disables submit when the link has no valid recovery token', () => {
    setUrl('');
    render(<ResetPasswordPage />);

    expect(screen.getByText('Invalid or expired reset link. Please request a new one.')).toBeInTheDocument();
    expect(screen.getByText('Reset Password')).toBeDisabled();
  });

  test('rejects empty fields', () => {
    render(<ResetPasswordPage />);
    fireEvent.click(screen.getByText('Reset Password'));
    expect(screen.getByText('Please fill in both fields.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects mismatched passwords', () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter new password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'differentpass' } });
    fireEvent.click(screen.getByText('Reset Password'));

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects passwords under 8 characters', () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter new password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Reset Password'));

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('valid matching passwords submit the token and show success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Password reset successfully' }),
    });

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter new password'), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByText('Reset Password'));

    expect(await screen.findByText('Password reset successfully!')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/reset-password'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'valid-token', password: 'newpassword123' }),
      })
    );
  });

  test('server rejection (expired token) shows the server message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Reset link expired or invalid' }),
    });

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter new password'), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByText('Reset Password'));

    expect(await screen.findByText('Reset link expired or invalid')).toBeInTheDocument();
  });
});
