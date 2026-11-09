# Wake word keyword file

Put the Porcupine keyword for "Drishti" here as `drishti_android.ppn` (Picovoice Console →
Porcupine → language English → phrase "Drishti" → platform Android → download, then rename).
The `withWakeWordAssets` config plugin copies it into the APK; the AccessKey goes in the
`PICOVOICE_ACCESS_KEY` environment variable (local `.env` or EAS env), next to `APP_TOKEN`.
