import prisma from './client';

async function checkSchema() {
  console.log('=== Checking Production Database Schema ===\n');
  
  try {
    // Check if divisionCode column exists on CompanyPriceListItem
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'CompanyPriceListItem' 
      AND column_name = 'divisionCode'
    ` as any[];
    
    if (result.length > 0) {
      console.log('✓ divisionCode column EXISTS on CompanyPriceListItem');
      console.log(`  Type: ${result[0].data_type}`);
    } else {
      console.log('✗ divisionCode column MISSING on CompanyPriceListItem');
      console.log('\nThis is the problem! The migration has not been applied to production.');
      console.log('Run: DATABASE_URL="prod-url" npx prisma migrate deploy');
    }
    
    // Check Division table
    const divisionCheck = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'Division'
    ` as any[];
    
    if (divisionCheck.length > 0) {
      console.log('✓ Division table exists');
    } else {
      console.log('✗ Division table MISSING');
    }
    
    // Try a simple CompanyPriceListItem query
    console.log('\nTrying to query CompanyPriceListItem...');
    const item = await prisma.companyPriceListItem.findFirst({
      take: 1,
    });
    
    if (item) {
      console.log('✓ Can query CompanyPriceListItem');
      console.log(`  Has divisionCode field: ${'divisionCode' in item}`);
    }
    
  } catch (error: any) {
    console.error('\n✗ ERROR:', error.message);
    if (error.code) {
      console.error(`  Code: ${error.code}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
