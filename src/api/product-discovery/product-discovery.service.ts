// src/api/product-discovery/product-discovery.service.ts

import axios from 'axios';
import { prisma } from '../../index';

// This function will be called by our scheduled job
export const fetchHotProductsFromRapidAPI = async () => {
    console.log('Starting job: Fetching hot products from RapidAPI...');

    const options = {
        method: 'GET',
        url: 'https://aliexpress-business-api.p.rapidapi.com/affiliate-hot-products.php',
        params: {
            currency: 'USD',
            lang: 'en'
        },
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'aliexpress-business-api.p.rapidapi.com'
        }
    };

    try {
        const response = await axios.request(options);
        const products = response.data.data.itemList;

        console.log(`Successfully fetched ${products.length} products. Saving to database...`);

        for (const product of products) {
            // 'upsert' creates new products or updates existing ones based on the unique productId
            const existingProduct = await prisma.winningProduct.findUnique({
                where: { productId: product.product_id },
            });

            const newHistoryEntry = {
                date: new Date().toISOString(),
                sales: product.lastest_volume,
            };

            await prisma.winningProduct.upsert({
                where: { productId: product.product_id },
                update: {
                    price: parseFloat(product.target_app_sale_price),
                    salesVolume: product.lastest_volume,
                    // Append new sales data to the historical array
                    historicalData: existingProduct?.historicalData
                        ? [...(Array.isArray(existingProduct.historicalData) ? existingProduct.historicalData : []), newHistoryEntry]
                        : [newHistoryEntry],
                },
                create: {
                    productId: product.product_id,
                    title: product.product_title,
                    productUrl: product.product_detail_url,
                    imageUrl: product.product_main_image_url,
                    price: parseFloat(product.target_app_sale_price),
                    salesVolume: product.lastest_volume,
                    // --- SAVE NEW RICH DATA ---
                    categoryName: product.second_level_category_name,
                    firstLevelCategoryName: product.first_level_category_name,
                    historicalData: [newHistoryEntry],
                },
            });
        }
        console.log('Database updated successfully.');

    } catch (error) {
        console.error('Error fetching products from RapidAPI:', error);
    }
};