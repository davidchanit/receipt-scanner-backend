import { IsString, IsNumber, IsArray, IsUrl, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiptItemDto {
  @IsString()
  item_name: string;

  @IsNumber()
  item_cost: number;
}

export class CreateReceiptDto {
  @IsString()
  date: string;

  @IsString()
  currency: string;

  @IsString()
  vendor_name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  receipt_items: ReceiptItemDto[];

  @IsNumber()
  tax: number;

  @IsNumber()
  total: number;

  @IsUrl()
  image_url: string;
}

export class ReceiptResponseDto {
  @IsString()
  id: string;

  @IsString()
  date: string;

  @IsString()
  currency: string;

  @IsString()
  vendor_name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  receipt_items: ReceiptItemDto[];

  @IsNumber()
  tax: number;

  @IsNumber()
  total: number;

  @IsUrl()
  image_url: string;
}

export class FileUploadDto {
  @IsOptional()
  @IsString()
  fieldname?: string;

  @IsOptional()
  @IsString()
  originalname?: string;

  @IsOptional()
  @IsString()
  encoding?: string;

  @IsOptional()
  @IsString()
  mimetype?: string;

  @IsOptional()
  buffer?: Buffer;

  @IsOptional()
  @IsNumber()
  size?: number;
}
