/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../Sidebar';
import { useAuth } from '@/lib/auth-context';

jest.mock('next/link', () => {
  return ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  );
});

jest.mock('next/image', () => {
  return ({ priority, ...props }: any) => <img {...props} alt={props.alt} />;
});

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/employee/my-performance',
  useRouter:   () => ({ push: mockPush }),
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockLogout = jest.fn();

function setUser(overrides: Partial<{
  role: string; full_name: string; avatar_url: string | null;
}> = {}) {
  mockUseAuth.mockReturnValue({
    user: {
      role: 'employee',
      full_name: 'Jordan Employee',
      avatar_url: null,
      ...overrides,
    },
    trainingBadgeCount: 0,
    logout: mockLogout,
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockLogout.mockClear();
});

describe('Sidebar', () => {
  test('renders employee nav items for an employee-role user', () => {
    setUser({ role: 'employee' });
    render(<Sidebar />);

    expect(screen.getByText('My Performance')).toBeInTheDocument();
    expect(screen.getByText('Training Passport')).toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
    // HQ-admin-only item must not leak into an employee's sidebar
    expect(screen.queryByText('Rating Settings')).not.toBeInTheDocument();
  });

  test('renders HQ admin nav items, including nested Template Management children only after expanding', () => {
    setUser({ role: 'hq_admin' });
    render(<Sidebar />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Rating Settings')).toBeInTheDocument();
    expect(screen.queryByText('Template Creation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Template Management'));
    expect(screen.getByText('Template Creation')).toBeInTheDocument();
  });

  test('shows the training badge count when there are unviewed training suggestions', () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'employee', full_name: 'Jordan Employee', avatar_url: null },
      trainingBadgeCount: 3,
      logout: mockLogout,
    });
    render(<Sidebar />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('hides the training badge when the count is zero', () => {
    setUser({ role: 'employee' });
    render(<Sidebar />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  test('shows the user’s initials and formatted role', () => {
    setUser({ role: 'sub_dept_admin', full_name: 'Jordan Employee' });
    render(<Sidebar />);
    expect(screen.getByText('JE')).toBeInTheDocument();
    expect(screen.getByText('Sub Dept Admin')).toBeInTheDocument();
  });

  test('logout button logs the user out and redirects to /login', () => {
    setUser({ role: 'employee' });
    render(<Sidebar />);

    fireEvent.click(screen.getByText('Logout'));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
