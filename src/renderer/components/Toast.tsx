import { ToastNotification } from '../../shared/types';

interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
  onTaskClick?: (taskId: string) => void;
}

function getToastIcon(type: ToastNotification['type']): string {
  switch (type) {
    case 'success':
      return 'OK';
    case 'error':
      return '!';
    case 'info':
      return 'i';
    default:
      return '?';
  }
}

export function ToastContainer({
  toasts,
  onDismiss,
  onTaskClick,
}: ToastContainerProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {toasts.map(toast => {
        const actions = (toast.actions && toast.actions.length > 0)
          ? toast.actions
          : (toast.action ? [toast.action] : []);

        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.type} ${actions.length > 0 ? 'toast-with-action' : ''}`}
            onClick={() => toast.taskId && onTaskClick?.(toast.taskId)}
            style={{ cursor: toast.taskId ? 'pointer' : 'default' }}
          >
            <div className={`toast-icon toast-icon-${toast.type}`}>
              {getToastIcon(toast.type)}
            </div>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && (
                <div className="toast-message">{toast.message}</div>
              )}
              {actions.length > 0 && (
                <div className="toast-actions">
                  {actions.map((action, index) => (
                    <button
                      key={`${toast.id}-action-${index}`}
                      className={`toast-action-btn toast-action-btn-${action.variant || 'primary'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        action.callback();
                        if (action.dismissOnClick ?? true) {
                          onDismiss(toast.id);
                        }
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="toast-dismiss"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(toast.id);
              }}
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastContainer;
