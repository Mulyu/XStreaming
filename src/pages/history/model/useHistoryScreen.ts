import React from 'react';
import axios from 'axios';

const formatMdString = (md: string) => {
  if (!md) {
    return '';
  }
  return md
    .replace(/##\s/g, '')
    .replace(/\r\n---\r\n/g, '\n')
    .replace(/\[([^\]]+)\]$([^)]+)$/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/^-\s/gm, '• ');
};

export function useHistoryScreen() {
  const [loading, setLoading] = React.useState(false);
  const [releases, setReleases] = React.useState([]);

  React.useEffect(() => {
    setLoading(true);
    axios
      .get('https://api.github.com/repos/Mulyu/XStreaming/releases', {
        timeout: 30 * 1000,
      })
      .then(res => {
        setLoading(false);
        if (res && res.data) {
          setReleases(res.data);
        }
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const releaseCards = releases.map((release: any) => ({
    id: release.id,
    name: release.name,
    body: formatMdString(release.body),
  }));

  return {
    loading,
    releaseCards,
  };
}

export type HistoryScreenViewModel = ReturnType<typeof useHistoryScreen>;
