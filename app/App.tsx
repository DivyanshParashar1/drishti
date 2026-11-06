import { StatusBar } from 'expo-status-bar';
import { BootScreen } from './src/screens/BootScreen';

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <BootScreen />
    </>
  );
}
