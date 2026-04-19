import { Font, StyleSheet } from '@react-pdf/renderer';

// 한국어 폰트 등록 (Noto Sans KR — Google Fonts CDN)
Font.register({
  family: 'NotoSansKR',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/gh/fonts-archive/NotoSansKR/NotoSansKR-Regular.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://cdn.jsdelivr.net/gh/fonts-archive/NotoSansKR/NotoSansKR-Bold.ttf',
      fontWeight: 700,
    },
  ],
});

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansKR',
    fontSize: 11,
    padding: 56,
    lineHeight: 1.6,
    color: '#111',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 6,
  },
  body: {
    marginBottom: 8,
    textAlign: 'justify',
  },
  meta: {
    fontSize: 10,
    color: '#555',
    marginBottom: 4,
  },
  signatureRow: {
    marginTop: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bullet: {
    marginLeft: 12,
    marginBottom: 4,
  },
  table: {
    marginTop: 8,
    marginBottom: 8,
    borderTop: '1pt solid #333',
    borderLeft: '1pt solid #333',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    padding: 6,
    borderRight: '1pt solid #333',
    borderBottom: '1pt solid #333',
    fontSize: 10,
  },
});
