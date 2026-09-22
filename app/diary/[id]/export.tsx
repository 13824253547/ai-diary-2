import { Redirect, useLocalSearchParams } from 'expo-router';
export default function ExportAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/share/result', params: { diaryId: id ?? '' } }} />;
}
