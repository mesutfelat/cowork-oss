/**
 * Browser script builders for X fallback automation.
 * Keep selectors and DOM heuristics centralized because X frequently updates markup.
 */
export function buildXComposeScript(params: {
  text: string;
  isReplyMode: boolean;
  editorSelectors: string[];
  buttonLabels: string[];
  submitSelectors: string[];
}): string {
  const { text, isReplyMode, editorSelectors, buttonLabels, submitSelectors } = params;
  return `
      (async () => {
        const text = ${JSON.stringify(text)};
        const editorSelectors = ${JSON.stringify(editorSelectors)};
        const buttonLabels = ${JSON.stringify(buttonLabels)};
        const submitSelectors = ${JSON.stringify(submitSelectors)};
        const postCheckDelayMs = 300;
        const maxPostChecks = 8;

        function normalize(value) {
          return (value || '').toLowerCase().trim();
        }

        function dispatchInputEvent(target, value) {
          const event = typeof InputEvent === 'function'
            ? new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: value || '',
            })
            : new Event('input', { bubbles: true, cancelable: true });
          target.dispatchEvent(event);
        }

        const findEditor = () => {
          for (const selector of editorSelectors) {
            const candidates = Array.from(document.querySelectorAll(selector));
            for (const candidate of candidates) {
              if (!(candidate instanceof HTMLElement)) continue;
              const rect = candidate.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                return { editor: candidate, selector };
              }
            }
          }
          return { editor: null, selector: null };
        };

        let found = findEditor();
        let editor = found.editor;
        let editorSelector = found.selector;
        if (!editor && ${JSON.stringify(isReplyMode)}) {
          const replyButtons = Array.from(document.querySelectorAll('button')).filter((button) => {
            if (!(button instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(button);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (button.getClientRects().length === 0) return false;
            const buttonText = normalize(button.getAttribute('aria-label') || button.textContent || '');
            const labels = ['reply', 'replying', 'reply now', 'show this thread'];
            return labels.some((label) => buttonText.includes(label));
          });

          if (replyButtons.length > 0) {
            replyButtons[0].click();
            await new Promise((resolve) => setTimeout(resolve, postCheckDelayMs));
            found = findEditor();
            editor = found.editor;
            editorSelector = found.selector;
          }
        }

        if (!editor) {
          return { success: false, reason: 'Composer editor not found', draft: false, submitted: false };
        }

        const normalized = normalize(text);
        const isEmpty = !normalized;
        if (editor.isContentEditable) {
          editor.focus();
          editor.textContent = '';
          const insertedWithExecCommand = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
          if (!insertedWithExecCommand) {
            editor.textContent = text;
          }
          dispatchInputEvent(editor, text);
        } else {
          editor.focus();
          editor.value = text;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const isVisible = (element) => {
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const buttons = Array.from(document.querySelectorAll('button')).filter((button) =>
          button instanceof HTMLElement && isVisible(button)
        ) as HTMLElement[];

        const selectorMatched = submitSelectors
          .map((selector) => Array.from(document.querySelectorAll(selector)))
          .flat()
          .filter((button) => button instanceof HTMLElement && isVisible(button))
          .find((button) => {
            const testId = normalize(button.getAttribute('data-testid') || '');
            const aria = normalize(button.getAttribute('aria-label') || '');
            const textContent = normalize(button.textContent || '');
            if (testId === 'tweetbutton' || testId === 'tweetbuttoninline' || testId.includes('sendtweet')) return true;
            return buttonLabels.some((candidateLabel) =>
              aria.includes(candidateLabel) || textContent.includes(candidateLabel)
            );
          }) as HTMLElement | undefined;

        const candidate = selectorMatched || buttons.find((button) => {
          const aria = normalize(button.getAttribute('data-testid') || '');
          const label = normalize(button.getAttribute('aria-label') || '');
          const textContent = normalize(button.textContent || '');
          if (aria === 'tweetbutton' || aria === 'tweetbuttoninline' || aria.includes('sendtweet')) return true;
          if (button instanceof HTMLButtonElement && button.type === 'submit') return true;
          return buttonLabels.some((candidateLabel) =>
            normalize(label).includes(candidateLabel) ||
            normalize(textContent).includes(candidateLabel) ||
            button.getAttribute('aria-label')?.toLowerCase().includes(candidateLabel) ||
            button.getAttribute('data-testid')?.toLowerCase().includes(candidateLabel)
          );
        });

        if (!candidate) {
          return {
            success: false,
            reason: 'Submit button not found',
            draft: true,
            submitted: false,
            editorSelector,
          };
        }

        if (isEmpty) {
          return { success: false, reason: 'Cannot post empty text', draft: true, submitted: false, editorSelector };
        }

        if (candidate instanceof HTMLButtonElement && (candidate as HTMLButtonElement).disabled) {
          return {
            success: false,
            reason: 'Submit button is disabled',
            draft: true,
            submitted: false,
            editorSelector,
            buttonSelector: candidate.getAttribute('data-testid') || candidate.getAttribute('aria-label') || candidate.textContent?.trim() || 'button',
          };
        }

        candidate.focus();
        candidate.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        const textBefore = normalize(editor.textContent || editor.value || '');
        const urlBefore = location.href;
        candidate.click();

        for (let attempt = 0; attempt < maxPostChecks; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, postCheckDelayMs));

          const textNow = normalize(editor instanceof HTMLElement ? (editor.textContent || editor.value || '') : '');
          if (textNow && textNow !== textBefore) {
            return {
              success: false,
              reason: 'Editor text changed after submit; manual verification may be required.',
              draft: true,
              submitted: false,
              editorSelector,
              buttonSelector: candidate.getAttribute('data-testid') || candidate.getAttribute('aria-label') || candidate.textContent?.trim() || 'button',
              writtenText: textBefore,
            };
          }

          const urlNow = location.href;
          if (urlNow !== urlBefore) {
            return {
              success: true,
              draft: true,
              submitted: true,
              editorSelector,
              buttonSelector: candidate.getAttribute('data-testid') || candidate.getAttribute('aria-label') || candidate.textContent?.trim() || 'button',
              writtenText: textBefore,
            };
          }

          const successToast = Array.from(document.querySelectorAll('[role="status"], [role="alert"]')).find((toast) => {
            if (!(toast instanceof HTMLElement)) return false;
            const toastText = normalize(toast.textContent || '');
            return /(posted|sent|tweet|reply|posted\\s+it|your\\s+post|success)/i.test(toastText);
          });
          if (successToast) {
            return {
              success: true,
              draft: true,
              submitted: true,
              editorSelector,
              buttonSelector: candidate.getAttribute('data-testid') || candidate.getAttribute('aria-label') || candidate.textContent?.trim() || 'button',
              writtenText: textBefore,
            };
          }

          const hasEditorCleared = !textBefore ? false : !textNow;
          if (hasEditorCleared) {
            return {
              success: true,
              draft: true,
              submitted: true,
              editorSelector,
              buttonSelector: candidate.getAttribute('data-testid') || candidate.getAttribute('aria-label') || candidate.textContent?.trim() || 'button',
              writtenText: textBefore,
            };
          }
        }

        return {
          success: false,
          reason: 'Compose submit did not produce a detectable posting signal within timeout.',
          draft: true,
          submitted: false,
          editorSelector,
          buttonSelector: candidate.getAttribute('data-testid') || candidate.getAttribute('aria-label') || candidate.textContent?.trim() || 'button',
          writtenText: textBefore,
        };
      })()
    `;
}

export function buildXToggleFollowScript(params: {
  buttonLabels: string[];
  followSelectors: string[];
  expectUnfollow: boolean;
  actionTarget: "follow" | "unfollow";
  maxRetries: number;
  retryDelayMs: number;
  userHandle?: string;
}): string {
  const {
    buttonLabels,
    followSelectors,
    expectUnfollow,
    actionTarget,
    maxRetries,
    retryDelayMs,
    userHandle,
  } = params;
  return `
      (async () => {
        const labels = ${JSON.stringify(buttonLabels)};
        const followSelectors = ${JSON.stringify(followSelectors)};
        const expectUnfollow = ${JSON.stringify(expectUnfollow)};
        const action = ${JSON.stringify(actionTarget)};
        const maxRetries = ${maxRetries};
        const retryDelayMs = ${retryDelayMs};
        const normalize = (value) => (value || '').toLowerCase().trim();
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        const isVisible = (button) => {
          const style = window.getComputedStyle(button);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const isFollowActionButton = (buttonText) => {
          if (!buttonText) return false;
          const text = normalize(buttonText);
          if (expectUnfollow) {
            return text.includes('unfollow') || text.includes('following');
          }
          return text.includes('follow') && !text.includes('followers');
        };

        const captureButtonState = (button) => {
          if (!button) {
            return null;
          }
          const text = normalize(button.textContent || '');
          return {
            button,
            text,
            ariaPressed: normalize(button.getAttribute('aria-pressed')),
            disabled: button.disabled === true,
            dataTestId: normalize(button.getAttribute('data-testid') || ''),
          };
        };

        const hasStateChanged = (before, after) => {
          if (!before || !after) return false;
          if (before.text !== after.text) return true;
          if (before.ariaPressed !== after.ariaPressed) return true;
          if (before.disabled !== after.disabled) return true;
          if (before.dataTestId !== after.dataTestId) return true;
          return false;
        };

        const hasFollowSuccessHint = () => {
          const candidates = Array.from(
            document.querySelectorAll('[role="status"], [role="alert"], [data-testid*="toast"], [data-testid*="snackbar"]')
          );
          return candidates.some((candidate) => {
            if (!(candidate instanceof HTMLElement)) return false;
            const toastText = (candidate.textContent || '').toLowerCase();
            if (!toastText) return false;
            return (
              toastText.includes('following') ||
              toastText.includes('unfollow') ||
              toastText.includes('followed') ||
              toastText.includes('removed from your')
            );
          });
        };

        const findFollowButtons = () =>
          followSelectors
          .map((selector) => Array.from(document.querySelectorAll(selector)))
          .flat()
          .filter((button) => button instanceof HTMLElement && isVisible(button))
          .filter((button) => {
            const ariaText = normalize(button.getAttribute('aria-label') || '');
            const visibleText = normalize(button.textContent || '');
            const combined = (ariaText + ' ' + visibleText).trim();
            return isFollowActionButton(combined);
          });

        const labelsSorted = labels.filter(Boolean).map(normalize);
        const matchesLabel = (value) => {
          const candidate = normalize(value);
          return labelsSorted.some((label) => candidate.includes(label));
        };
        const queryButtons = () =>
          Array.from(document.querySelectorAll('button')).filter((button) =>
            button instanceof HTMLElement && isVisible(button)
          );

        const selectorMatched = findFollowButtons().find((button) => {
          const ariaText = normalize(button.getAttribute('aria-label') || '');
          const visibleText = normalize(button.textContent || '');
          const combined = (ariaText + ' ' + visibleText).trim();
          if (!combined) return false;
          return matchesLabel(combined);
        });

        if (selectorMatched instanceof HTMLButtonElement) {
          const beforeText = normalize(selectorMatched.textContent || selectorMatched.getAttribute('aria-label') || '');
          const beforeState = captureButtonState(selectorMatched);
          const isMatch = expectUnfollow ? (beforeText.includes('unfollow') || beforeText.includes('following')) : (beforeText.includes('follow') && !beforeText.includes('followers'));
          if (!isMatch) {
            return { success: false, reason: 'Could not identify ' + action + ' button' };
          }
          selectorMatched.click();
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            const current = (findFollowButtons().find((button) => {
              const ariaText = normalize(button.getAttribute('aria-label') || '');
              const visibleText = normalize(button.textContent || '');
              return matchesLabel((ariaText + ' ' + visibleText).trim());
            })) || selectorMatched;

            const afterState = captureButtonState(current);
            const afterText = normalize(current?.textContent || current?.getAttribute('aria-label') || '');
            const hasHint = hasFollowSuccessHint();
            if ((afterText && hasStateChanged(beforeState, afterState)) || hasHint) {
              return {
                success: true,
                selector: current.getAttribute('data-testid') || current.getAttribute('aria-label') || (labels[0] || 'follow'),
                beforeText: beforeText,
                afterText,
                changed: true,
                attempts: attempt + 1,
                targetUser: ${JSON.stringify(userHandle || "")},
              };
            }
            if (attempt < maxRetries - 1) {
              await sleep(retryDelayMs);
            }
          }

          const fallbackAfterState = captureButtonState(selectorMatched);
          const fallbackAfter = normalize(fallbackAfterState?.text || fallbackAfterState?.button?.getAttribute('aria-label') || '');
          return {
            success: true,
            selector: selectorMatched.getAttribute('data-testid') || selectorMatched.getAttribute('aria-label') || (labels[0] || 'follow'),
            beforeText,
            afterText: fallbackAfter,
            changed: false,
            attempts: maxRetries,
            reason: 'Button state did not change after ' + maxRetries + ' retries.',
            targetUser: ${JSON.stringify(userHandle || "")},
          };
        }

        const match = queryButtons().find((button) => {
          const test = normalize(button.getAttribute('aria-label') || button.textContent || '');
          if (!isFollowActionButton(test)) return false;
          return labelsSorted.some((label) => test.includes(label));
        });

        if (!match) {
          return { success: false, reason: action + ' button not found' };
        }

        const beforeText = normalize(match.textContent || match.getAttribute('aria-label') || '');
        const beforeState = captureButtonState(match);
        match.click();
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const current = (queryButtons().find((button) => {
            const currentText = normalize(button.getAttribute('aria-label') || button.textContent || '');
            return isFollowActionButton(currentText) && labelsSorted.some((label) => currentText.includes(label));
          })) || match;

          const afterText = normalize(current?.textContent || current?.getAttribute('aria-label') || '');
          const afterState = captureButtonState(current);
          const hasHint = hasFollowSuccessHint();
          if ((afterText && hasStateChanged(beforeState, afterState)) || hasHint) {
            return {
              success: true,
              selector: current.getAttribute('data-testid') || current.getAttribute('aria-label') || (labels[0] || 'follow'),
              beforeText: beforeText,
              afterText,
              changed: true,
              attempts: attempt + 1,
              targetUser: ${JSON.stringify(userHandle || "")},
            };
          }
          if (attempt < maxRetries - 1) {
            await sleep(retryDelayMs);
          }
        }

        const fallbackAfter = normalize(match.textContent || match.getAttribute('aria-label') || '');
        return {
          success: true,
          selector: match.getAttribute('data-testid') || match.getAttribute('aria-label') || (labels[0] || 'follow'),
          beforeText,
          afterText: fallbackAfter,
          changed: false,
          attempts: maxRetries,
          reason: 'Button state did not change after ' + maxRetries + ' retries.',
          targetUser: ${JSON.stringify(userHandle || "")},
        };
      })()
    `;
}
