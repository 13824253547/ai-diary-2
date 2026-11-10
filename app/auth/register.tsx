import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PuzzleCaptcha, type PuzzleCaptchaHandle } from '../../src/components/auth/puzzle-captcha';
import { Button } from '../../src/components/common/button';
import { Screen } from '../../src/components/layout/screen';
import {
  AccountAuthError,
  registerAccount,
  requestRegistrationEmailCode,
} from '../../src/services/account-auth';
import { colors } from '../../src/theme/tokens';

export default function RegisterScreen() {
  const router = useRouter();
  const captcha = useRef<PuzzleCaptchaHandle>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailChallengeId, setEmailChallengeId] = useState('');
  const [emailCodeMessage, setEmailCodeMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState('');

  const sendEmailCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('请输入有效邮箱地址。');
      return;
    }
    const proof = captcha.current?.getProof();
    if (!proof) {
      setError('请先完成图形验证。');
      return;
    }
    setSendingCode(true);
    setError('');
    try {
      const challenge = await requestRegistrationEmailCode(
        normalizedEmail,
        proof.challengeId,
        proof.x,
      );
      setEmailChallengeId(challenge.challengeId);
      setEmailCode('');
      setEmailCodeMessage(`验证码已发送至 ${normalizedEmail}，10分钟内有效。重发前需再次完成图形验证。`);
      await captcha.current?.refresh();
    } catch (caught) {
      setError(caught instanceof AccountAuthError ? caught.message : '验证码发送失败，请重试。');
      await captcha.current?.refresh();
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async () => {
    if (!/^[A-Za-z0-9_]{4,32}$/.test(username.trim())) {
      setError('用户名需为4至32位字母、数字或下划线。');
      return;
    }
    if (!emailChallengeId || !/^\d{6}$/.test(emailCode)) {
      setError('请先验证邮箱并输入6位验证码。');
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError('密码长度需为8至128位。');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await registerAccount(
        username,
        email.trim().toLowerCase(),
        password,
        emailChallengeId,
        emailCode,
      );
    } catch (caught) {
      setError(caught instanceof AccountAuthError ? caught.message : '注册暂时未完成，请重试。');
      if (caught instanceof AccountAuthError
        && ['account_unavailable', 'email_verification_failed'].includes(caught.code)) {
        setEmailChallengeId('');
        setEmailCodeMessage('请重新获取邮箱验证码后再试。');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.brand}>
        <Text style={styles.title}>创建账号</Text>
        <Text style={styles.subtitle}>用账号保护并同步你的旅行回忆</Text>
      </View>
      <View style={styles.form}>
        <TextInput
          accessibilityLabel="用户名"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={setUsername}
          placeholder="用户名（4至32位）"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={username}
        />
        <TextInput
          accessibilityLabel="注册邮箱"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy && !sendingCode}
          keyboardType="email-address"
          onChangeText={value => {
            setEmail(value);
            setEmailChallengeId('');
            setEmailCode('');
            setEmailCodeMessage('');
          }}
          placeholder="邮箱地址"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={email}
        />
        <TextInput
          accessibilityLabel="设置密码"
          autoCapitalize="none"
          editable={!busy && !sendingCode}
          onChangeText={setPassword}
          placeholder="设置密码（至少8位）"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <TextInput
          accessibilityLabel="确认密码"
          autoCapitalize="none"
          editable={!busy && !sendingCode}
          onChangeText={setConfirmPassword}
          onSubmitEditing={() => void submit()}
          placeholder="再次输入密码"
          placeholderTextColor={colors.textMuted}
          returnKeyType="go"
          secureTextEntry
          style={styles.input}
          value={confirmPassword}
        />
        <PuzzleCaptcha ref={captcha} purpose="register" />
        <Button
          label={emailChallengeId ? '重新发送邮箱验证码' : '发送邮箱验证码'}
          onPress={() => void sendEmailCode()}
          disabled={busy || sendingCode}
          loading={sendingCode}
          loadingLabel="正在发送验证码"
        />
        {emailCodeMessage ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{emailCodeMessage}</Text> : null}
        <TextInput
          accessibilityLabel="邮箱验证码"
          autoCapitalize="none"
          editable={!busy && !sendingCode}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={setEmailCode}
          onSubmitEditing={() => void submit()}
          placeholder="6位邮箱验证码"
          placeholderTextColor={colors.textMuted}
          returnKeyType="go"
          style={styles.input}
          value={emailCode}
        />
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <Text style={styles.warning}>邮箱用于验证注册和账号注销，不用于密码找回。忘记密码后将无法恢复账号及其中的数据。</Text>
        <Button label="创建账号" onPress={() => void submit()} disabled={busy} loading={busy} loadingLabel="正在创建账号" />
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/auth/login')} style={styles.link}>
        <Text style={styles.linkText}>已有账号？返回登录</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: 22, paddingTop: 28, paddingBottom: 28 },
  brand: { gap: 8, alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 14 },
  form: { gap: 12 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, paddingHorizontal: 14, fontSize: 15 },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: colors.brandStrong, fontSize: 14, fontWeight: '600' },
  warning: { color: colors.textSecondary, backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 19 },
  notice: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
