/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '../page';
import { useAuth } from '@/lib/auth-context';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

const mockUseAuth = useAuth as jest.Mock;
const mockSetUser = jest.fn();

beforeEach(() => {
  mockPush.mockClear();
  mockSetUser.mockClear();
  mockUseAuth.mockReturnValue({ setUser: mockSetUser });
  global.fetch = jest.fn();
  localStorage.clear();
});

describe('LoginPage', () => {
  test('shows a validation error and does not call the API when fields are empty', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign In'));

    expect(await screen.findByText('Email and password are required')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('successful login stores the session and redirects to the role dashboard', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Login successful',
        redirect: '/employee/profile',
        access_token: 'tok-123',
        user: { id: 'emp-123', full_name: 'Jordan Employee', email: 'j@dgl.com', role: 'employee' },
      }),
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'j@dgl.com' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/employee/profile'));
    expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'emp-123', role: 'employee' }));
    expect(localStorage.getItem('pms_token')).toBe('tok-123');
    expect(JSON.parse(localStorage.getItem('pms_user')!).full_name).toBe('Jordan Employee');
  });

  test('wrong credentials show the server error message and do not navigate', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Invalid email or password' }),
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'j@dgl.com' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByText('Sign In'));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  test('network failure shows a connection error instead of crashing', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'j@dgl.com' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Sign In'));

    expect(await screen.findByText(/Cannot connect to the server/)).toBeInTheDocument();
  });

  test('forgot password flow: empty email is rejected client-side', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Forgot password?'));
    fireEvent.click(screen.getByText('Send Reset Link'));

    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('forgot password flow: submits and shows a generic success message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<LoginPage />);
    fireEvent.click(screen.getByText('Forgot password?'));
    fireEvent.change(screen.getByPlaceholderText('Enter your work email'), { target: { value: 'j@dgl.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));

    expect(await screen.findByText(/reset link has been sent/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/forgot-password'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
