import { useEffect } from 'react';

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ThePeptideAI` : 'ThePeptideAI';
    return () => { document.title = 'ThePeptideAI'; };
  }, [title]);
}
