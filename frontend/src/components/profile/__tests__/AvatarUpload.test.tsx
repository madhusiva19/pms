/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AvatarUpload from '../AvatarUpload';
import { apiFetch } from '@/lib/apiFetch';

jest.mock('@/lib/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.Mock;

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  return file;
}

// jsdom doesn't implement FileReader's actual image decoding — stub it so
// handleFileChange's reader.onload fires synchronously with a fake data URL.
class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  readAsDataURL() {
    this.result = 'data:image/png;base64,fake';
    this.onload?.();
  }
}
// @ts-expect-error overriding for test
global.FileReader = FakeFileReader;

describe('AvatarUpload', () => {
  const onUpdate = jest.fn();

  beforeEach(() => {
    onUpdate.mockClear();
    mockApiFetch.mockClear();
  });

  function openMenuAndSelectFile(file: File) {
    render(
      <AvatarUpload
        currentUrl={null}
        initials="JE"
        employeeId="emp-123"
        onUpdate={onUpdate}
        avatarBg="#2563EB"
      />
    );
    fireEvent.click(screen.getByText('JE'));
    fireEvent.click(screen.getByText('Upload Photo'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    return input;
  }

  // KNOWN BUG (found by this test): handleFileChange sets an error message
  // for a rejected file, but that message only ever renders inside the
  // preview modal — which handleFileChange returns out of *before* opening.
  // Net effect: an invalid file selection fails completely silently, no
  // message reaches the user. Asserting the current (broken) behavior here
  // so a future fix updates this test rather than being masked by it.
  test('rejects a disallowed file type without opening the preview modal (error is set but never shown — bug)', () => {
    openMenuAndSelectFile(makeFile('malware.exe', 'application/octet-stream', 1000));

    expect(screen.queryByText('Preview Photo')).not.toBeInTheDocument();
    expect(screen.queryByText('Only JPG, PNG, WebP allowed')).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('rejects a file over 2MB without opening the preview modal (error is set but never shown — bug)', () => {
    openMenuAndSelectFile(makeFile('big.png', 'image/png', 3 * 1024 * 1024));

    expect(screen.queryByText('Preview Photo')).not.toBeInTheDocument();
    expect(screen.queryByText('Image must be under 2MB')).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('valid file shows the preview modal, then Save uploads and calls onUpdate', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ avatar_url: 'https://x/avatars/emp-123.png' }),
    });

    openMenuAndSelectFile(makeFile('avatar.png', 'image/png', 1000));

    expect(screen.getByText('Preview Photo')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('https://x/avatars/emp-123.png'));
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/profile/upload-avatar'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('shows the server error message when upload fails', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Upload failed: storage quota exceeded' }),
    });

    openMenuAndSelectFile(makeFile('avatar.png', 'image/png', 1000));
    fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByText('Upload failed: storage quota exceeded')).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test('remove photo confirmation calls the remove-avatar endpoint and clears the avatar', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    render(
      <AvatarUpload
        currentUrl="https://x/avatars/emp-123.png"
        initials="JE"
        employeeId="emp-123"
        onUpdate={onUpdate}
        avatarBg="#2563EB"
      />
    );

    fireEvent.click(screen.getByAltText('Profile'));
    fireEvent.click(screen.getByText('Remove Photo'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(null));
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/profile/remove-avatar/emp-123'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('a supervisor viewing someone else’s avatar cannot open the edit menu', () => {
    render(
      <AvatarUpload
        currentUrl={null}
        initials="JE"
        employeeId="emp-123"
        onUpdate={onUpdate}
        avatarBg="#2563EB"
        viewMode="supervisor"
      />
    );
    fireEvent.click(screen.getByText('JE'));
    expect(screen.queryByText('Upload Photo')).not.toBeInTheDocument();
  });
});
