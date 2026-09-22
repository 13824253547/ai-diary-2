import { Redirect, useLocalSearchParams } from 'expo-router';
export default function StyledAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/share/result', params: { diaryId: id ?? '' } }} />;
}
