package com.restaurant.kiosk.di

import com.restaurant.kiosk.data.remote.SupabaseApi
import com.restaurant.kiosk.data.remote.SupabaseClient
import com.restaurant.kiosk.data.repository.KioskRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideSupabaseClient(): SupabaseClient = SupabaseClient()

    @Provides
    @Singleton
    fun provideSupabaseApi(client: SupabaseClient): SupabaseApi = SupabaseApi(client)

    @Provides
    @Singleton
    fun provideKioskRepository(
        api: SupabaseApi,
        client: SupabaseClient
    ): KioskRepository = KioskRepository(api, client)
}
