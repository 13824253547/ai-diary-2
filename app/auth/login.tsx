import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PuzzleCaptcha, type PuzzleCaptchaHandle } from '../../src/components/auth/puzzle-captcha';
import { Button } from '../../src/components/common/button';
import { Screen } from '../../src/components/layout/screen';
import { AccountAuthError, loginAccount } from '../../src/services/account-auth';
import { colors } from '../../src/theme/tokens';

export default function LoginScreen() {
  const router = useRouter();
  const captcha = useRef<PuzzleCaptchaHandle>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const proof = captcha.current?.getProof();
    if (!username.trim() || !password || !proof) {
      setError(proof ? '请输入用户名和密码。' : '请先完成图形验证。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await loginAccount(username, password, proof.challengeId, proof.x);
    } catch (caught) {
      setError(caught instanceof AccountAuthError ? caught.message : '登录暂时未完成，请重试。');
      await captcha.current?.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.brand}>
        <Text style={styles.title}>欢迎回来</Text>
        <Text style={styles.subtitle}>登录后继续整理你的旅行回忆</Text>
      </View>
      <View style={styles.form}>
        <TextInput
          accessibilityLabel="用户名"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={setUsername}
          placeholder="用户名"
          placeholderTextColor={colors.textMuted}
          returnKeyType="next"
          style={styles.input}
          value={username}
        />
        <TextInput
          accessibilityLabel="密码"
          autoCapitalize="none"
          editable={!busy}
          onChangeText={setPassword}
          onSubmitEditing={() => void submit()}
          placeholder="密码"
          placeholderTextColor={colors.textMuted}
          returnKeyType="go"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <PuzzleCaptcha ref={captcha} purpose="login" />
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <Button label="登录" onPress={() => void submit()} disabled={busy} loading={busy} loadingLabel="正在登录" />
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/auth/register')} style={styles.link}>
        <Text style={styles.linkText}>还没有账号？创建账号</Text>
      </Pressable>
      <Text style={styles.notice}>本应用不提供密码找回，请妥善保管登录密码。</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: 24, paddingTop: 36, paddingBottom: 32 },
  brand: { gap: 8, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 14 },
  form: { gap: 14 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, paddingHorizontal: 14, fontSize: 15 },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: colors.brandStrong, fontSize: 14, fontWeight: '600' },
  notice: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
