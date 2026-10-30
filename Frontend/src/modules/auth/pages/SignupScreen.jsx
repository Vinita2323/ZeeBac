import AuthLoginScreen from './AuthLoginScreen';

/**
 * Customer signup screen: renders unified auth in Register mode
 */
export default function SignupScreen(props) {
  return <AuthLoginScreen role="customer" initialMode="register" {...props} />;
}
