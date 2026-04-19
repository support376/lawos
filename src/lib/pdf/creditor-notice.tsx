import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from './base';

export interface CreditorNoticeData {
  senderName: string;       // 발신인 (의뢰인 or 변호사)
  senderAddress?: string;
  lawyerName: string;
  lawFirmName: string;
  recipientName: string;    // 수신인 (채권자명)
  recipientAddress?: string;
  debtorName: string;
  subject?: string;
  body: string;             // 본문 내용
  date: string;
}

export function CreditorNoticeDoc(data: CreditorNoticeData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>내 용 증 명</Text>

        <Text style={styles.meta}>발신: {data.senderName}</Text>
        {data.senderAddress && <Text style={styles.meta}>주소: {data.senderAddress}</Text>}
        <Text style={styles.meta}>
          대리인: {data.lawFirmName} {data.lawyerName} 변호사
        </Text>

        <Text style={{ ...styles.meta, marginTop: 10 }}>수신: {data.recipientName} 귀중</Text>
        {data.recipientAddress && (
          <Text style={styles.meta}>주소: {data.recipientAddress}</Text>
        )}

        <Text style={{ ...styles.sectionTitle, marginTop: 20 }}>
          제목: {data.subject ?? `${data.debtorName} 채무 관련 개인회생 신청 예정 통보`}
        </Text>

        <Text style={{ ...styles.body, marginTop: 10 }}>{data.body}</Text>

        <Text style={{ ...styles.body, textAlign: 'center', marginTop: 32 }}>
          {data.date}
        </Text>

        <View style={{ ...styles.signatureRow, justifyContent: 'flex-end' }}>
          <View>
            <Text style={styles.meta}>위 발신인 대리인</Text>
            <Text>{data.lawFirmName}</Text>
            <Text>변호사 {data.lawyerName}</Text>
            <Text style={{ marginTop: 16 }}>(인)</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export const DEFAULT_REHAB_NOTICE_BODY = (debtorName: string) =>
  `본 변호사는 ${debtorName}님의 채무 정리 관련 법률 대리인입니다.

${debtorName}님은 경제적 어려움으로 인하여 「채무자 회생 및 파산에 관한 법률」에 따른 개인회생 절차를 준비 중임을 알려드립니다.

이에 다음 사항을 통지합니다.

1. 귀사는 본 통지 수령 시점부터 ${debtorName}님에 대한 일체의 추심행위(전화·방문·문자 등)를 중단하여 주시기 바랍니다.
2. 가압류·가처분 등의 보전처분 또는 추심 관련 법적 조치 시 본 변호사에게 사전 통지 바랍니다.
3. 향후 개인회생 신청 시 귀사는 채권자로 기재될 예정이며, 인가 시 변제계획에 따라 변제됩니다.

법률상 의무 위반 시 「채권의 공정한 추심에 관한 법률」 등에 따라 법적 조치를 할 수 있음을 알립니다.

귀사의 협조를 요청 드립니다.`;
