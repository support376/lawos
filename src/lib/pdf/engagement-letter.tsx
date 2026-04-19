/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from './base';

export interface EngagementLetterData {
  clientName: string;
  clientAddress?: string;
  clientRrn?: string; // 주민번호 (선택)
  lawFirmName: string;
  lawyerName: string;
  caseTitle: string;
  caseType: string;
  retainerFee?: string; // 수임료
  scope: string;
  date: string; // YYYY-MM-DD
}

export function EngagementLetterDoc(data: EngagementLetterData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>위 임 계 약 서</Text>

        <Text style={styles.body}>
          위임인(이하 &quot;갑&quot;) {data.clientName}과(와) 수임인(이하 &quot;을&quot;)
          {' '}{data.lawFirmName} 소속 {data.lawyerName} 변호사는 아래 사건에 관한 법률
          사무 위임에 대하여 다음과 같이 계약을 체결한다.
        </Text>

        <Text style={styles.sectionTitle}>제1조 (위임사무)</Text>
        <Text style={styles.body}>
          갑은 을에게 &quot;{data.caseTitle}&quot; 사건({data.caseType})에 관한 아래 법률
          사무를 위임한다.
        </Text>
        <Text style={styles.bullet}>- {data.scope}</Text>

        <Text style={styles.sectionTitle}>제2조 (보수)</Text>
        <Text style={styles.body}>
          갑은 을에게 위임사무의 대가로 아래 보수를 지급한다.
        </Text>
        <Text style={styles.bullet}>
          - 수임료: {data.retainerFee ?? '별도 협의'}
        </Text>
        <Text style={styles.bullet}>
          - 지급 방법 및 시기: 계약 체결일로부터 협의에 따름
        </Text>
        <Text style={styles.bullet}>
          - 별도 실비(인지대·송달료·감정료 등)는 갑이 부담한다.
        </Text>

        <Text style={styles.sectionTitle}>제3조 (수임사무의 범위)</Text>
        <Text style={styles.body}>
          본 수임은 제1조의 사건에 한하며, 별건 또는 상소심은 별도 계약으로 한다. 을은
          변호사법 제26조에 따른 비밀유지의무를 부담한다.
        </Text>

        <Text style={styles.sectionTitle}>제4조 (위임 해지)</Text>
        <Text style={styles.body}>
          갑 또는 을은 민법 제689조에 따라 언제든 위임을 해지할 수 있으며, 해지 시
          까지의 사무 처리에 따른 보수 및 실비는 정산한다.
        </Text>

        <Text style={styles.sectionTitle}>제5조 (관할)</Text>
        <Text style={styles.body}>
          본 계약에 관한 분쟁은 을의 사무소 소재지 관할 법원을 제1심 관할 법원으로
          한다.
        </Text>

        <Text style={{ ...styles.body, marginTop: 16 }}>
          갑과 을은 본 계약의 내용을 충분히 이해하였음을 확인하며, 위 계약 체결의 증거로
          본 계약서 2부를 작성하여 각 1부씩 보관한다.
        </Text>

        <Text style={{ ...styles.body, textAlign: 'center', marginTop: 24 }}>
          {data.date}
        </Text>

        <View style={styles.signatureRow}>
          <View>
            <Text style={styles.meta}>위 임 인 (갑)</Text>
            <Text>성명: {data.clientName}</Text>
            {data.clientAddress && <Text>주소: {data.clientAddress}</Text>}
            <Text style={{ marginTop: 24 }}>(서명 또는 인)</Text>
          </View>
          <View>
            <Text style={styles.meta}>수 임 인 (을)</Text>
            <Text>사무소: {data.lawFirmName}</Text>
            <Text>변호사: {data.lawyerName}</Text>
            <Text style={{ marginTop: 24 }}>(서명 또는 인)</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
