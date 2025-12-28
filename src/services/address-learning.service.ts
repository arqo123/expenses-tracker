import pg from 'pg';

export interface AddressLearning {
  id: number;
  rawAddress: string;
  normalizedAddress: string;
  city?: string;
  street?: string;
  merchantName: string;
  usageCount: number;
  userName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserState {
  userName: string;
  stateType: string;
  stateData: Record<string, unknown>;
  expiresAt: string;
}

// Common Polish cities for address parsing
const POLISH_CITIES = [
  'rzeszow', 'rzeszów', 'warszawa', 'krakow', 'kraków', 'wroclaw', 'wrocław',
  'poznan', 'poznań', 'gdansk', 'gdańsk', 'szczecin', 'lodz', 'łódź',
  'lublin', 'katowice', 'bialystok', 'białystok', 'gdynia', 'czestochowa',
  'częstochowa', 'radom', 'sosnowiec', 'torun', 'toruń', 'kielce', 'gliwice',
  'zabrze', 'bytom', 'olsztyn', 'bielsko-biala', 'bielsko-biała', 'rybnik',
  'ruda slaska', 'ruda śląska', 'tychy', 'dabrowa gornicza', 'dąbrowa górnicza',
  'elblag', 'elbląg', 'plock', 'płock', 'opole', 'gorzow', 'gorzów',
  'walbrzych', 'wałbrzych', 'zielona gora', 'zielona góra', 'tarnow', 'tarnów',
  'chorzow', 'chorzów', 'koszalin', 'kalisz', 'legnica', 'grudziadz', 'grudziądz',
  'jaworzno', 'slupsk', 'słupsk', 'jastrzebie-zdroj', 'jastrzębie-zdrój',
  'nowy sacz', 'nowy sącz', 'jelenia gora', 'jelenia góra', 'siedlce', 'myslowice',
  'mysłowice', 'pila', 'piła', 'ostrow wielkopolski', 'ostrów wielkopolski',
  'lubin', 'stargard', 'gniezno', 'glogow', 'głogów', 'przemysl', 'przemyśl',
  'zamosc', 'zamość', 'tomaszow mazowiecki', 'tomaszów mazowiecki', 'leszno',
  'stalowa wola', 'kedzierzyn-kozle', 'kędzierzyn-koźle', 'mielec', 'tczew',
  'bielawa', 'belchatow', 'bełchatów', 'swidnica', 'świdnica', 'zgierz',
  'piotrkow trybunalski', 'piotrków trybunalski', 'zory', 'żory', 'ostroleka',
  'ostrołęka', 'skierniewice', 'radomsko', 'skarzysko-kamienna', 'skarżysko-kamienna',
  'kutno', 'ciechanow', 'ciechanów', 'sieradz', 'zawiercie', 'brodnica',
  'krosno', 'jaslo', 'jasło', 'sanok', 'debica', 'dębica', 'stalowa wola', 'lancut', 'łańcut'
];

export class AddressLearningService {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  /**
   * Normalize address for consistent matching
   * - Lowercase, trim, remove extra whitespace
   * - Standardize Polish abbreviations
   * - Extract city and street components
   */
  normalizeAddress(rawAddress: string): {
    normalized: string;
    city?: string;
    street?: string;
  } {
    let addr = rawAddress.toLowerCase().trim();

    // Normalize Polish street abbreviations
    addr = addr
      .replace(/\bul\.?\s*/gi, 'ul. ')
      .replace(/\bal\.?\s*/gi, 'al. ')
      .replace(/\bpl\.?\s*/gi, 'pl. ')
      .replace(/\bos\.?\s*/gi, 'os. ')
      .replace(/\s+/g, ' ')
      .replace(/,\s+/g, ', ');

    // Extract city
    let city: string | undefined;
    for (const c of POLISH_CITIES) {
      if (addr.includes(c)) {
        city = c;
        break;
      }
    }

    // Extract street name (between ul./al./etc and number or comma)
    let street: string | undefined;
    const streetMatch = addr.match(/(?:ul\.|al\.|pl\.|os\.)?\s*([a-ząćęłńóśźż\s]+?)(?:\s+\d|,|$)/i);
    if (streetMatch?.[1]) {
      street = streetMatch[1].trim();
      // Remove city name from street if present
      if (city && street.includes(city)) {
        street = street.replace(city, '').trim();
      }
    }

    return {
      normalized: addr,
      city,
      street,
    };
  }

  /**
   * Find merchant by address - tries exact match, then partial
   */
  async findMerchantByAddress(rawAddress: string): Promise<AddressLearning | null> {
    const { normalized, city, street } = this.normalizeAddress(rawAddress);

    // 1. Try exact normalized match first
    const exactResult = await this.pool.query(
      `SELECT * FROM address_learnings
       WHERE normalized_address = $1
       LIMIT 1`,
      [normalized]
    );

    if (exactResult.rows.length > 0) {
      await this.incrementUsage(exactResult.rows[0].id);
      return this.mapRow(exactResult.rows[0]);
    }

    // 2. Try partial match: same city + street
    if (city && street) {
      const partialResult = await this.pool.query(
        `SELECT * FROM address_learnings
         WHERE city = $1 AND street ILIKE $2
         ORDER BY usage_count DESC
         LIMIT 1`,
        [city, `%${street}%`]
      );

      if (partialResult.rows.length > 0) {
        return this.mapRow(partialResult.rows[0]);
      }
    }

    // 3. Try just street name match (for chain stores on same street)
    if (street && street.length > 5) {
      const streetResult = await this.pool.query(
        `SELECT * FROM address_learnings
         WHERE street ILIKE $1
         ORDER BY usage_count DESC
         LIMIT 1`,
        [`%${street}%`]
      );

      if (streetResult.rows.length > 0) {
        return this.mapRow(streetResult.rows[0]);
      }
    }

    return null;
  }

  /**
   * Save a new address → merchant mapping
   */
  async learnAddress(
    rawAddress: string,
    merchantName: string,
    userName?: string
  ): Promise<AddressLearning> {
    const { normalized, city, street } = this.normalizeAddress(rawAddress);

    const result = await this.pool.query(
      `INSERT INTO address_learnings (
        raw_address, normalized_address, city, street,
        merchant_name, user_name
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (normalized_address) DO UPDATE SET
        merchant_name = $5,
        usage_count = address_learnings.usage_count + 1,
        updated_at = NOW()
      RETURNING *`,
      [rawAddress, normalized, city, street, merchantName, userName]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Save user state for pending operations (e.g., waiting for store name input)
   */
  async saveUserState(
    userName: string,
    stateType: string,
    stateData: Record<string, unknown>
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_states (user_name, state_type, state_data, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')
       ON CONFLICT (user_name, state_type) DO UPDATE SET
         state_data = $3,
         expires_at = NOW() + INTERVAL '5 minutes'`,
      [userName, stateType, JSON.stringify(stateData)]
    );
  }

  /**
   * Get user state if not expired
   */
  async getUserState(userName: string, stateType: string): Promise<UserState | null> {
    const result = await this.pool.query(
      `SELECT * FROM user_states
       WHERE user_name = $1 AND state_type = $2 AND expires_at > NOW()`,
      [userName, stateType]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      userName: row.user_name,
      stateType: row.state_type,
      stateData: row.state_data,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Clear user state
   */
  async clearUserState(userName: string, stateType: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_states WHERE user_name = $1 AND state_type = $2`,
      [userName, stateType]
    );
  }

  /**
   * Cleanup expired states and old learnings
   */
  async cleanup(): Promise<{ expiredStates: number }> {
    const statesResult = await this.pool.query(
      `DELETE FROM user_states WHERE expires_at < NOW()`
    );

    return {
      expiredStates: statesResult.rowCount || 0,
    };
  }

  /**
   * Get all learned addresses (for debugging/admin)
   */
  async getAllLearnings(limit: number = 50): Promise<AddressLearning[]> {
    const result = await this.pool.query(
      `SELECT * FROM address_learnings
       ORDER BY usage_count DESC, updated_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  private async incrementUsage(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE address_learnings
       SET usage_count = usage_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  private mapRow(row: Record<string, unknown>): AddressLearning {
    return {
      id: row.id as number,
      rawAddress: row.raw_address as string,
      normalizedAddress: row.normalized_address as string,
      city: row.city as string | undefined,
      street: row.street as string | undefined,
      merchantName: row.merchant_name as string,
      usageCount: row.usage_count as number,
      userName: row.user_name as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
