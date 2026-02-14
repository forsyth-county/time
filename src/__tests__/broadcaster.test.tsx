import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Broadcaster } from '@/components/Broadcaster';

// Mock dependencies
jest.mock('@/hooks/usePeerConnection', () => ({
  usePeerCall: jest.fn(() => ({
    callId: 'test-call-id-123',
    status: 'idle',
    localStream: null,
    remoteStream: null,
    error: null,
    isMuted: false,
    startCall: jest.fn(),
    toggleMute: jest.fn(),
    switchCamera: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

// Mock hCaptcha component
jest.mock('@hcaptcha/react-hcaptcha', () => {
  const React = require('react');
  return React.forwardRef((props: any, ref: any) => {
    const handleClick = () => {
      if (props.onVerify) {
        props.onVerify('test-captcha-token-12345');
      }
    };
    return (
      <div data-testid="hcaptcha-mock" onClick={handleClick}>
        hCaptcha Mock
      </div>
    );
  });
});

describe('Broadcaster Component with hCaptcha', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set the environment variable with a test key
    process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001';
  });

  it('should render the broadcaster with hCaptcha', () => {
    render(<Broadcaster />);
    
    expect(screen.getByText('Your Call ID')).toBeInTheDocument();
    expect(screen.getByText('test-call-id-123')).toBeInTheDocument();
    expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
  });

  it('should disable Start Call button before hCaptcha verification', () => {
    render(<Broadcaster />);
    
    const startButton = screen.getByRole('button', { name: /start call/i });
    expect(startButton).toBeDisabled();
    expect(screen.getByText(/complete the verification above/i)).toBeInTheDocument();
  });

  it('should enable Start Call button after hCaptcha verification', async () => {
    const user = userEvent.setup();
    render(<Broadcaster />);
    
    const startButton = screen.getByRole('button', { name: /start call/i });
    expect(startButton).toBeDisabled();
    
    // Simulate hCaptcha verification
    const captcha = screen.getByTestId('hcaptcha-mock');
    await user.click(captcha);
    
    await waitFor(() => {
      expect(startButton).not.toBeDisabled();
    });
  });

  it('should show verification message before captcha completion', () => {
    render(<Broadcaster />);
    
    expect(screen.getByText(/complete the verification above to start the call/i)).toBeInTheDocument();
  });

  it('should render hCaptcha only when site key is available', () => {
    render(<Broadcaster />);
    
    expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
  });

  it('should not render hCaptcha when site key is missing', () => {
    delete process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
    render(<Broadcaster />);
    
    expect(screen.queryByTestId('hcaptcha-mock')).not.toBeInTheDocument();
  });
});
