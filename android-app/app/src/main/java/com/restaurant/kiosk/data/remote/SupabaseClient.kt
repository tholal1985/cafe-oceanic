package com.restaurant.kiosk.data.remote

import com.restaurant.kiosk.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.header
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SupabaseClient @Inject constructor() {

    val supabaseUrl: String = BuildConfig.SUPABASE_URL
    val anonKey: String = BuildConfig.SUPABASE_ANON_KEY

    private var authToken: String? = null

    fun setAuthToken(token: String?) {
        authToken = token
    }

    fun getAuthToken(): String? = authToken

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        encodeDefaults = true
    }

    fun buildClient(token: String? = null): HttpClient {
        val bearerToken = token ?: authToken ?: anonKey
        return HttpClient(Android) {
            install(ContentNegotiation) {
                json(json)
            }
            install(Logging) {
                logger = object : Logger {
                    override fun log(message: String) {
                        android.util.Log.d("SupabaseClient", message)
                    }
                }
                level = LogLevel.BODY
            }
            defaultRequest {
                header("apikey", anonKey)
                header("Authorization", "Bearer $bearerToken")
                header("Content-Type", "application/json")
                header("Prefer", "return=representation")
            }
        }
    }

    fun buildAnonClient(): HttpClient = buildClient(anonKey)
}
