// src/api/product-discovery/product-discovery.service.ts

import axios from 'axios';
import { prisma } from '../../index';

// --- CONFIGURATION ---
const PAGES_TO_FETCH = 10;    // How many pages to loop through (e.g., 10 pages)
const ITEMS_PER_PAGE = 50;    // How many products to request per page

// This function will be called by our scheduled job
export const fetchHotProductsFromRapidAPI = async () => {
  console.log(`Starting job: Fetching ${PAGES_TO_FETCH} pages of hot products from RapidAPI...`);
  
  let totalProductsSaved = 0;

  // Loop from page 1 to the number of pages we want to fetch
  for (let currentPage = 1; currentPage <= PAGES_TO_FETCH; currentPage++) {
    
    console.log(`Fetching page ${currentPage}...`);

    const options = {
      method: 'GET',
      url: 'https://aliexpress-business-api.p.rapidapi.com/affiliate-hot-products.php',
      params: {
        currency: 'USD',
        lang: 'en',
        pageIndex: currentPage.toString(), // <-- DYNAMIC PAGE INDEX
        pageSize: ITEMS_PER_PAGE.toString(),   // <-- INCREASED PAGE SIZE
        filter: 'LAST_VOLUME',               // <-- FILTER BY SALES
        sortBy: 'desc',                      // <-- SORT BY DESCENDING
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'aliexpress-business-api.p.rapidapi.com'
      }
    };

    try {
      const response = await axios.request(options);
      
      // Check if itemList exists and is an array
      if (!response.data?.data?.itemList || !Array.isArray(response.data.data.itemList)) {
          console.log(`No items found on page ${currentPage}. Stopping job.`);
          break; // Exit the loop if there are no more products to fetch
      }
        
      const products = response.data.data.itemList;
      console.log(`  > Found ${products.length} products on page ${currentPage}. Processing...`);

      for (const product of products) {
        // Ensure the product has a valid ID before trying to save it
        if (!product.product_id) {
          continue; // Skip this product if it has no ID
        }

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
            price: parseFloat(product.target_app_sale_price) || 0,
            salesVolume: product.lastest_volume || 0,
            historicalData: existingProduct?.historicalData 
              ? [...(Array.isArray(existingProduct.historicalData) ? existingProduct.historicalData : []), newHistoryEntry]
              : [newHistoryEntry],
          },
          create: {
            productId: product.product_id,
            title: product.product_title,
            productUrl: product.product_detail_url,
            imageUrl: product.product_main_image_url,
            price: parseFloat(product.target_app_sale_price) || 0,
            salesVolume: product.lastest_volume || 0,
            categoryName: product.second_level_category_name,
            firstLevelCategoryName: product.first_level_category_name,
            historicalData: [newHistoryEntry],
          },
        });
      }
      totalProductsSaved += products.length;

      // A small delay to avoid hitting API rate limits too aggressively
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay between pages

    } catch (error) {
      console.error(`Error fetching page ${currentPage} from RapidAPI:`, error);
      // If one page fails, we can choose to stop or continue. Let's stop to be safe.
      break; 
    }
  }

  console.log(`Job finished: Successfully saved or updated ${totalProductsSaved} products in total.`);
};