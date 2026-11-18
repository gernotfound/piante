-- Publication is part of the specimen's optimistic version history.
CREATE TRIGGER public_listing_version_insert AFTER INSERT ON public_listings
BEGIN UPDATE specimens SET version=version+1, updated_at=NEW.updated_at WHERE id=NEW.specimen_id; END;
CREATE TRIGGER public_listing_version_update AFTER UPDATE ON public_listings
BEGIN UPDATE specimens SET version=version+1, updated_at=NEW.updated_at WHERE id=NEW.specimen_id; END;
CREATE TRIGGER public_listing_version_delete AFTER DELETE ON public_listings
BEGIN UPDATE specimens SET version=version+1, updated_at=OLD.updated_at WHERE id=OLD.specimen_id; END;
