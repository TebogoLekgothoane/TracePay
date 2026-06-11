declare module 'react-native-get-sms-android' {
  const SmsAndroid: {
    list: (
      filter: string,
      fail: (error: string) => void,
      success: (count: number, smsList: string) => void
    ) => void;
  };
  export default SmsAndroid;
}

declare module 'react-native-android-sms-listener' {
  const AndroidSmsListener: {
    addListener: (
      callback: (message: { originatingAddress: string; body: string }) => void
    ) => { remove: () => void };
  };
  export default AndroidSmsListener;
}
