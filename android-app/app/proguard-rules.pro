# Add project specific ProGuard rules here.
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception

# Kotlin serialization
-keepattributes InnerClasses
-keep,includedescriptorclasses class com.restaurant.kiosk.**$$serializer { *; }
-keepclassmembers class com.restaurant.kiosk.** {
    *** Companion;
}
-keepclasseswithmembers class com.restaurant.kiosk.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Ktor
-keep class io.ktor.** { *; }
-keep class kotlinx.coroutines.** { *; }

# Hilt
-keep class dagger.hilt.** { *; }
-keep @dagger.hilt.android.HiltAndroidApp class * { *; }
-keep @dagger.hilt.android.AndroidEntryPoint class * { *; }

# Coil
-keep class coil.** { *; }

# Data models
-keep class com.restaurant.kiosk.data.model.** { *; }
