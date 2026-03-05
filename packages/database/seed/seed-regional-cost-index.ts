/**
 * Seed script: RegionalCostIndex
 *
 * Loads US regional cost-of-living indices (ZIP3 level) into the
 * RegionalCostIndex table. NYC = 100 (base). All other regions are relative.
 *
 * Data sources: BLS, C2ER, ACS composites. Values are approximate and should
 * be refreshed annually.
 *
 * Usage:
 *   cd packages/database
 *   npx ts-node seed/seed-regional-cost-index.ts
 */

import { RegionType } from "@prisma/client";
import prisma from "../src/client";

// ---------------------------------------------------------------------------
// US ZIP3 regions — key metro areas + representative rural areas
// Each row: [zip3, name, costIndex]
// NYC = 100 baseline; Houston ≈ 82; Rural US avg ≈ 65
// ---------------------------------------------------------------------------

const US_ZIP3_REGIONS: Array<[string, string, number]> = [
  // New York Metro
  ["100", "Manhattan, NY", 100],
  ["101", "Manhattan/Midtown, NY", 100],
  ["102", "Manhattan/Downtown, NY", 100],
  ["103", "Staten Island, NY", 90],
  ["104", "Bronx, NY", 88],
  ["110", "Queens, NY", 92],
  ["111", "Long Island City, NY", 93],
  ["112", "Brooklyn, NY", 91],
  ["113", "Brooklyn South, NY", 90],
  ["114", "Jamaica, NY", 87],
  ["115", "Western Nassau, NY", 95],
  ["116", "Long Island, NY", 96],
  ["117", "Hicksville, NY", 94],
  ["118", "Suffolk, NY", 92],
  ["119", "Riverhead, NY", 90],

  // New Jersey
  ["070", "Newark, NJ", 90],
  ["071", "Jersey City, NJ", 92],
  ["073", "Jersey Shore, NJ", 88],
  ["076", "Hackensack, NJ", 93],
  ["078", "West Orange, NJ", 91],
  ["085", "Trenton, NJ", 85],
  ["088", "New Brunswick, NJ", 88],

  // Connecticut
  ["060", "Hartford, CT", 87],
  ["065", "New Haven, CT", 88],
  ["068", "Stamford, CT", 97],
  ["069", "Bridgeport, CT", 91],

  // Massachusetts
  ["021", "Boston, MA", 96],
  ["022", "Boston Inner, MA", 97],
  ["024", "Lexington, MA", 95],

  // Washington DC Metro
  ["200", "Washington, DC", 95],
  ["201", "Washington, DC", 95],
  ["220", "Arlington, VA", 94],
  ["221", "Fairfax, VA", 96],
  ["207", "Bethesda, MD", 95],
  ["208", "Rockville, MD", 92],

  // California
  ["900", "Los Angeles, CA", 93],
  ["901", "Los Angeles Central, CA", 93],
  ["902", "Inglewood, CA", 90],
  ["906", "Whittier, CA", 89],
  ["910", "Pasadena, CA", 91],
  ["917", "Industry/Pomona, CA", 87],
  ["920", "San Diego, CA", 90],
  ["921", "San Diego South, CA", 89],
  ["925", "Riverside, CA", 84],
  ["930", "Ventura, CA", 89],
  ["931", "Santa Barbara, CA", 92],
  ["940", "San Francisco, CA", 98],
  ["941", "San Francisco, CA", 98],
  ["943", "Palo Alto, CA", 99],
  ["944", "San Mateo, CA", 97],
  ["945", "Oakland, CA", 94],
  ["946", "Oakland, CA", 94],
  ["947", "Berkeley, CA", 95],
  ["948", "Richmond, CA", 90],
  ["950", "San Jose, CA", 96],
  ["951", "San Jose, CA", 96],
  ["952", "Stockton, CA", 80],
  ["956", "Sacramento, CA", 85],
  ["958", "Sacramento, CA", 85],
  ["960", "Redding, CA", 78],

  // Pacific Northwest
  ["980", "Seattle, WA", 92],
  ["981", "Seattle, WA", 92],
  ["982", "Everett, WA", 88],
  ["970", "Portland, OR", 87],
  ["972", "Portland, OR", 87],
  ["973", "Salem, OR", 80],

  // Texas
  ["770", "Houston, TX", 82],
  ["771", "Houston, TX", 82],
  ["772", "Houston Outer, TX", 80],
  ["773", "Huntsville, TX", 72],
  ["750", "Dallas, TX", 79],
  ["751", "Dallas, TX", 79],
  ["752", "Dallas, TX", 79],
  ["760", "Fort Worth, TX", 78],
  ["761", "Fort Worth, TX", 78],
  ["780", "San Antonio, TX", 76],
  ["781", "San Antonio, TX", 76],
  ["786", "Austin, TX", 82],
  ["787", "Austin, TX", 82],
  ["790", "Amarillo, TX", 70],
  ["793", "Lubbock, TX", 70],
  ["795", "Abilene, TX", 69],
  ["797", "Midland/Odessa, TX", 78],
  ["799", "El Paso, TX", 73],

  // Florida
  ["331", "Miami, FL", 86],
  ["332", "Miami Beach, FL", 89],
  ["333", "Fort Lauderdale, FL", 86],
  ["334", "West Palm Beach, FL", 87],
  ["320", "Jacksonville, FL", 78],
  ["321", "Daytona Beach, FL", 76],
  ["327", "Orlando, FL", 80],
  ["328", "Orlando, FL", 80],
  ["335", "Tampa, FL", 79],
  ["336", "Tampa, FL", 79],
  ["337", "St. Petersburg, FL", 78],
  ["339", "Fort Myers, FL", 79],

  // Illinois
  ["606", "Chicago Central, IL", 84],
  ["600", "North Suburban Chicago, IL", 86],
  ["601", "Northwest Suburban Chicago, IL", 84],
  ["603", "Oak Park, IL", 85],
  ["604", "South Suburban Chicago, IL", 81],
  ["605", "Fox Valley, IL", 82],
  ["617", "Champaign, IL", 72],
  ["618", "Centralia, IL", 68],
  ["619", "Southern IL", 66],
  ["620", "East St. Louis, IL", 72],

  // Georgia
  ["300", "Atlanta North, GA", 78],
  ["301", "Atlanta North, GA", 78],
  ["303", "Atlanta Central, GA", 79],
  ["304", "Suwanee, GA", 77],
  ["305", "Gainesville, GA", 73],
  ["310", "Augusta, GA", 72],
  ["312", "Macon, GA", 70],
  ["314", "Savannah, GA", 74],
  ["316", "Valdosta, GA", 67],

  // Colorado
  ["800", "Denver, CO", 86],
  ["801", "Denver, CO", 86],
  ["802", "Denver SE, CO", 85],
  ["803", "Boulder, CO", 90],
  ["808", "Colorado Springs, CO", 80],
  ["809", "Pueblo, CO", 74],
  ["816", "Grand Junction, CO", 74],

  // Arizona
  ["850", "Phoenix, AZ", 76],
  ["851", "Phoenix, AZ", 76],
  ["852", "Mesa, AZ", 75],
  ["853", "Chandler, AZ", 76],
  ["856", "Tucson, AZ", 74],
  ["857", "Tucson, AZ", 74],
  ["860", "Flagstaff, AZ", 78],

  // Michigan
  ["480", "Detroit, MI", 78],
  ["481", "Detroit, MI", 78],
  ["482", "Detroit West, MI", 79],
  ["483", "Detroit North, MI", 77],
  ["484", "Flint, MI", 72],
  ["489", "Lansing, MI", 73],
  ["493", "Grand Rapids, MI", 74],
  ["494", "Muskegon, MI", 70],
  ["497", "Traverse City, MI", 73],

  // North Carolina
  ["271", "Greensboro, NC", 74],
  ["272", "Raleigh, NC", 78],
  ["273", "Durham, NC", 77],
  ["274", "Fayetteville, NC", 71],
  ["276", "Winston-Salem, NC", 74],
  ["280", "Charlotte, NC", 77],
  ["281", "Charlotte, NC", 77],
  ["287", "Asheville, NC", 75],

  // Tennessee
  ["370", "Nashville, TN", 78],
  ["371", "Nashville, TN", 78],
  ["372", "Knoxville, TN", 72],
  ["373", "Chattanooga, TN", 72],
  ["374", "Johnson City, TN", 69],
  ["380", "Memphis, TN", 74],
  ["381", "Memphis, TN", 74],

  // Ohio
  ["430", "Columbus, OH", 76],
  ["431", "Columbus, OH", 76],
  ["440", "Cleveland, OH", 76],
  ["441", "Cleveland, OH", 76],
  ["442", "Akron, OH", 74],
  ["450", "Cincinnati, OH", 76],
  ["451", "Cincinnati, OH", 76],
  ["453", "Dayton, OH", 73],

  // Pennsylvania
  ["150", "Pittsburgh, PA", 76],
  ["151", "Pittsburgh, PA", 76],
  ["152", "Pittsburgh, PA", 76],
  ["190", "Philadelphia, PA", 86],
  ["191", "Philadelphia, PA", 86],

  // Minnesota
  ["550", "Minneapolis, MN", 80],
  ["551", "St. Paul, MN", 80],
  ["553", "Minneapolis, MN", 80],
  ["554", "Minneapolis West, MN", 81],
  ["558", "Duluth, MN", 73],
  ["560", "Mankato, MN", 71],
  ["565", "St. Cloud, MN", 73],

  // Missouri
  ["630", "St. Louis, MO", 76],
  ["631", "St. Louis, MO", 76],
  ["640", "Kansas City, MO", 76],
  ["641", "Kansas City, MO", 76],
  ["648", "Joplin, MO", 68],
  ["650", "Jefferson City, MO", 70],
  ["656", "Springfield, MO", 69],

  // Indiana
  ["460", "Indianapolis, IN", 74],
  ["461", "Indianapolis, IN", 74],
  ["462", "Indianapolis, IN", 74],
  ["467", "Fort Wayne, IN", 71],
  ["468", "Muncie, IN", 68],
  ["474", "Bloomington, IN", 72],
  ["476", "Evansville, IN", 70],

  // Virginia
  ["230", "Richmond, VA", 78],
  ["231", "Richmond, VA", 78],
  ["233", "Norfolk, VA", 76],
  ["234", "Virginia Beach, VA", 77],
  ["240", "Roanoke, VA", 73],
  ["246", "Charlottesville, VA", 78],

  // Louisiana
  ["700", "New Orleans, LA", 78],
  ["701", "New Orleans, LA", 78],
  ["707", "Baton Rouge, LA", 76],
  ["710", "Shreveport, LA", 72],
  ["705", "Lafayette, LA", 73],

  // Nevada
  ["890", "Las Vegas, NV", 80],
  ["891", "Las Vegas, NV", 80],
  ["894", "Reno, NV", 82],

  // Hawaii
  ["967", "Honolulu, HI", 98],
  ["968", "Honolulu, HI", 98],

  // Alaska
  ["995", "Anchorage, AK", 88],
  ["996", "Anchorage, AK", 88],
  ["997", "Fairbanks, AK", 85],
  ["998", "Juneau, AK", 90],

  // Utah
  ["840", "Salt Lake City, UT", 78],
  ["841", "Salt Lake City, UT", 78],
  ["843", "Ogden, UT", 75],
  ["846", "Provo, UT", 76],
  ["847", "Cedar City, UT", 70],

  // Wisconsin
  ["530", "Milwaukee, WI", 78],
  ["531", "Milwaukee, WI", 78],
  ["532", "Milwaukee West, WI", 77],
  ["537", "Madison, WI", 80],

  // Oklahoma
  ["730", "Oklahoma City, OK", 72],
  ["731", "Oklahoma City, OK", 72],
  ["740", "Tulsa, OK", 73],
  ["741", "Tulsa, OK", 73],

  // South Carolina
  ["290", "Columbia, SC", 74],
  ["291", "Columbia, SC", 74],
  ["293", "Greenville, SC", 73],
  ["294", "Charleston, SC", 78],

  // Alabama
  ["350", "Birmingham, AL", 73],
  ["351", "Birmingham, AL", 73],
  ["356", "Huntsville, AL", 74],
  ["360", "Montgomery, AL", 71],
  ["365", "Mobile, AL", 72],

  // Mississippi
  ["390", "Jackson, MS", 70],
  ["391", "Jackson, MS", 70],
  ["395", "Meridian, MS", 66],
  ["397", "Columbus, MS", 65],

  // Arkansas
  ["720", "Little Rock, AR", 71],
  ["721", "Little Rock, AR", 71],
  ["727", "Fayetteville, AR", 72],
  ["729", "Fort Smith, AR", 68],

  // Kansas
  ["660", "Kansas City, KS", 74],
  ["661", "Kansas City, KS", 74],
  ["670", "Wichita, KS", 72],
  ["671", "Wichita, KS", 72],

  // Iowa
  ["500", "Des Moines, IA", 74],
  ["501", "Des Moines, IA", 74],
  ["522", "Cedar Rapids, IA", 73],
  ["527", "Davenport, IA", 72],

  // Nebraska
  ["680", "Omaha, NE", 74],
  ["681", "Omaha, NE", 74],
  ["685", "Lincoln, NE", 73],

  // New Mexico
  ["870", "Albuquerque, NM", 74],
  ["871", "Albuquerque, NM", 74],
  ["875", "Santa Fe, NM", 80],

  // Idaho
  ["836", "Boise, ID", 76],
  ["837", "Boise, ID", 76],

  // West Virginia
  ["250", "Charleston, WV", 71],
  ["251", "Charleston, WV", 71],
  ["260", "Wheeling, WV", 68],

  // Montana
  ["590", "Billings, MT", 73],
  ["591", "Billings, MT", 73],
  ["598", "Missoula, MT", 76],
  ["599", "Great Falls, MT", 72],

  // South Dakota
  ["570", "Sioux Falls, SD", 72],
  ["571", "Sioux Falls, SD", 72],
  ["575", "Pierre, SD", 68],
  ["577", "Rapid City, SD", 72],

  // North Dakota
  ["580", "Fargo, ND", 74],
  ["581", "Fargo, ND", 74],
  ["585", "Bismarck, ND", 72],

  // Wyoming
  ["820", "Cheyenne, WY", 73],
  ["821", "Cheyenne, WY", 73],
  ["825", "Casper, WY", 75],

  // Vermont
  ["050", "Burlington, VT", 82],
  ["056", "Montpelier, VT", 80],

  // New Hampshire
  ["030", "Manchester, NH", 84],
  ["031", "Manchester, NH", 84],
  ["036", "Concord, NH", 82],
  ["038", "Keene, NH", 80],

  // Maine
  ["040", "Portland, ME", 80],
  ["041", "Portland, ME", 80],
  ["043", "Augusta, ME", 76],
  ["049", "Bangor, ME", 74],

  // Rhode Island
  ["028", "Providence, RI", 84],
  ["029", "Providence, RI", 84],

  // Delaware
  ["197", "Wilmington, DE", 84],
  ["198", "Wilmington, DE", 84],
  ["199", "Dover, DE", 78],
];

async function main() {
  const effectiveYear = new Date().getFullYear();

  console.log(`Seeding ${US_ZIP3_REGIONS.length} regional cost indices for year ${effectiveYear}...`);

  let created = 0;
  let skipped = 0;

  for (const [regionCode, regionName, costIndex] of US_ZIP3_REGIONS) {
    const multiplier = Math.round((costIndex / 100) * 10000) / 10000;

    try {
      await prisma.regionalCostIndex.upsert({
        where: {
          RegionalCostIndex_region_year_key: { regionCode, effectiveYear },
        },
        create: {
          regionCode,
          regionName,
          regionType: RegionType.ZIP3,
          costIndex,
          multiplier,
          source: "C2ER/BLS",
          effectiveYear,
        },
        update: {
          regionName,
          costIndex,
          multiplier,
          source: "C2ER/BLS",
        },
      });
      created++;
    } catch (err: any) {
      console.error(`  ✗ ${regionCode}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`Done: ${created} upserted, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
