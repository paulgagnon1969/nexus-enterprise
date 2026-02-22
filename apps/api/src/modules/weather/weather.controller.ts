import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { WeatherService } from "./weather.service";
import { CombinedAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("projects/:projectId/weather")
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  /**
   * Preview weather for a project on a given date.
   * Used by the frontend/mobile to show a weather preview before saving a daily log.
   *
   * GET /projects/:projectId/weather?date=YYYY-MM-DD
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get()
  async getWeather(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("date") date?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const result = await this.weather.getWeatherForProject(
      projectId,
      user.companyId,
      targetDate,
    );

    if (!result) {
      return {
        available: false,
        configured: this.weather.isConfigured(),
        summary: null,
        data: null,
      };
    }

    return {
      available: true,
      configured: true,
      summary: result.summary,
      data: result.data,
    };
  }
}
