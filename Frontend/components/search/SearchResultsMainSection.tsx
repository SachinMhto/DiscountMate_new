import React, { useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import SidebarFilters from "./SidebarFilters";
import ProductGrid from "../home/ProductGrid";
import ProductCard, { Product } from "../home/ProductCard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ImageSearchResult, useImageSearch } from "../../app/(tabs)/ImageSearchContext";

function buildImageSearchImageUrl(imageUrl: string | null | undefined): string | null {
   if (!imageUrl) return null;
   // Full CDN URL (MongoDB-sourced): browsers can display cross-origin images directly
   if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return imageUrl;
   }
   return null;
}

function mapImageResultToProduct(result: ImageSearchResult): Product {
   const parsePrice = (value: string | null | undefined): number => {
      if (!value) return 0;
      const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
      return Number.isNaN(parsed) ? 0 : parsed;
   };

   const formatPrice = (value: string | null | undefined): string => {
      const p = parsePrice(value);
      return p > 0 ? `$${p.toFixed(2)}` : "-";
   };

   const colesPrice = parsePrice(result.price_now);
   const priceWas = parsePrice(result.price_was);
   const savings = Math.max(0, priceWas - colesPrice);

   const retailers = [
      { storeKey: "coles",       name: "Coles",       price: formatPrice(result.price_now),        isCheapest: false, unitPriceLabel: result.price_comparable ?? undefined },
      { storeKey: "woolworths",  name: "Woolworths",  price: formatPrice(result.woolworths_price),  isCheapest: false },
      { storeKey: "iga",         name: "IGA",         price: formatPrice(result.iga_price),         isCheapest: false },
   ];

   // Mark cheapest store that has a price
   const priced = retailers.filter((r) => r.price !== "-");
   if (priced.length > 0) {
      const cheapest = priced.reduce((a, b) =>
         parsePrice(a.price) <= parsePrice(b.price) ? a : b
      );
      cheapest.isCheapest = true;
   }

   return {
      id: result.product_id,
      name: result.name,
      subtitle: `Similarity: ${(result.similarity_score * 100).toFixed(1)}%`,
      icon: "tag",
      link_image: buildImageSearchImageUrl(result.image_url),
      badge: savings > 0 ? `Save $${savings.toFixed(2)}` : `${(result.similarity_score * 100).toFixed(0)}% Match`,
      trendLabel: "Visual match",
      trendTone: "neutral",
      retailers,
   };
}

export default function SearchResultsMainSection() {
   const { query, imageSearch, minPrice, maxPrice, retailers, sort: urlSort, page } = useLocalSearchParams();
   const router = useRouter();
   const urlString = (value: unknown) => typeof value === "string" ? value : "";
   const urlNumber = (value: unknown) => {
      const n = Number(urlString(value));
      return urlString(value) !== "" && Number.isFinite(n) && n >= 0 ? n : null;
   };
   const savedSort = ["name_asc", "name_desc", "price_asc", "price_desc"].includes(urlString(urlSort))
      ? urlString(urlSort) as "name_asc" | "name_desc" | "price_asc" | "price_desc"
      : "name_asc";
   const isImageSearch = imageSearch === "true";
   const { results: imageResults } = useImageSearch();
   const searchQuery = Array.isArray(query) ? (query[0] ?? "").trim() : urlString(query).trim();
   const [sort, setSort] = useState<"name_asc" | "name_desc" | "price_asc" | "price_desc">(savedSort);
   const [filters, setFilters] = useState<{
      priceRange: { min: number | null; max: number | null };
      retailers: string[];
   }>({
      priceRange: { min: urlNumber(minPrice), max: urlNumber(maxPrice) },
      retailers: urlString(retailers).split(",").filter(v => ["coles", "woolworths", "iga"].includes(v)),
   });
   const savedPage = Math.max(1, Number.parseInt(urlString(page), 10) || 1);
   const updateUrl = (newFilters = filters, newSort = sort, newPage = 1) => {
      router.replace({ pathname: "/search", params: {
         query: searchQuery || urlString(query),
         ...(newFilters.priceRange.min != null ? { minPrice: String(newFilters.priceRange.min) } : {}),
         ...(newFilters.priceRange.max != null ? { maxPrice: String(newFilters.priceRange.max) } : {}),
         ...(newFilters.retailers.length ? { retailers: newFilters.retailers.join(",") } : {}),
         sort: newSort,
         page: String(newPage),
      } });
   };

   useEffect(() => {
      setSort(savedSort);
      setFilters({
         priceRange: { min: urlNumber(minPrice), max: urlNumber(maxPrice) },
         retailers: urlString(retailers).split(",").filter(v => ["coles", "woolworths", "iga"].includes(v)),
      });
   }, [minPrice, maxPrice, retailers, urlSort]);

   const handleFiltersChange = (newFilters: {
      priceRange: { min: number | null; max: number | null };
      retailers: string[];
   }) => {
      setFilters(newFilters);
      updateUrl(newFilters, sort, 1);
   };

   if (isImageSearch) {
      return (
         <View className="bg-[#F9FAFB]">
            <View className="w-full flex-row items-start">
               <SidebarFilters onFiltersChange={handleFiltersChange} initialFilters={filters} />

               <View className="flex-1 px-4 md:px-8 py-8">
                  <View className="mb-6">
                     <Text className="text-2xl font-bold text-gray-900 mb-2">
                        Image Search Results
                     </Text>
                     <Text className="text-sm text-gray-600">
                        Showing visually similar Coles catalogue products
                     </Text>
                  </View>

                  {imageResults.length === 0 ? (
                     <View className="border border-dashed border-gray-200 rounded-2xl p-8 items-center justify-center bg-white">
                        <Text className="text-base font-semibold text-gray-700 mb-1">
                           No matches found.
                        </Text>
                        <Text className="text-sm text-gray-500">
                           Try uploading a clearer product photo.
                        </Text>
                     </View>
                  ) : (
                     <View className="flex-row flex-wrap -mx-2">
                        {imageResults.map((result) => (
                           <View key={result.product_id} className="w-full md:w-1/2 lg:w-1/3 px-2 mb-6">
                              <ProductCard product={mapImageResultToProduct(result)} />
                           </View>
                        ))}
                     </View>
                  )}
               </View>
            </View>
         </View>
      );
   }

   return (
      <View className="bg-[#F9FAFB]">
         <View className="w-full flex-row items-start">
            {/* Sidebar with Filters */}
            <SidebarFilters key={`${filters.priceRange.min}-${filters.priceRange.max}-${filters.retailers.join(',')}`} initialFilters={filters} onFiltersChange={handleFiltersChange} />

            {/* Main Content Area */}
            <View className="flex-1 px-4 md:px-8 py-8">
               {/* Search Results Header */}
               {searchQuery ? (
                  <View className="mb-6">
                     <Text className="text-2xl font-bold text-gray-900 mb-2">
                        Search Results for "{searchQuery}"
                     </Text>
                     <Text className="text-sm text-gray-600">
                        Results for {searchQuery}
                     </Text>
                  </View>
               ) : (
                  <View className="mb-6">
                     <Text className="text-2xl font-bold text-gray-900 mb-2">
                        Search Results
                     </Text>
                     <Text className="text-sm text-gray-600">
                        Enter a search query to see results
                     </Text>
                  </View>
               )}

               {/* Product Grid */}
               <View className="flex-row flex-wrap mb-4">
                  {([
                     ["name_asc", "Name A–Z"],
                     ["name_desc", "Name Z–A"],
                     ["price_asc", "Price low–high"],
                     ["price_desc", "Price high–low"],
                  ] as const).map(([value, label]) => (
                     <Pressable key={value} accessibilityRole="button" onPress={() => { setSort(value); updateUrl(filters, value, 1); }} className="mr-2 mb-2 px-3 py-2 rounded-lg border border-gray-200">
                        <Text className={sort === value ? "font-bold text-primary_green" : "text-gray-700"}>{label}</Text>
                     </Pressable>
                  ))}
               </View>
               <ProductGrid
                  activeCategory={undefined}
                  searchQuery={searchQuery}
                  priceRangeFilter={filters.priceRange}
                  retailerFilter={filters.retailers}
                  sort={sort}
                  initialPage={savedPage}
                  onPageChange={(newPage) => updateUrl(filters, sort, newPage)}
                  requireSearch
               />
            </View>
         </View>
      </View>
   );
}
